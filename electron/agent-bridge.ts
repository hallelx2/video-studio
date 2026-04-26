import {
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { app, Notification, type BrowserWindow } from "electron";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { AgentEvent, AppConfig, GenerateRequest } from "./types.js";

/**
 * Owns the lifecycle of the agent child process AND the optional HyperFrames
 * preview process — a long-running dev server the user can open in their
 * browser to inspect a composition before committing to a full render.
 */
export class AgentBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private previewProc: ChildProcess | null = null;
  private previewUrl: string | null = null;
  private previewWorkspace: string | null = null;
  private window: BrowserWindow | null = null;
  private buffer = "";
  /** Ring buffer of the most recent stderr lines from the agent — included in
   *  the agent-exit error message so non-zero exits actually tell the user
   *  what went wrong instead of just "exited with code 1". */
  private stderrTail: string[] = [];
  private static readonly STDERR_TAIL_MAX = 12;
  /** Toggled by config; when false, maybeNotify() short-circuits silently. */
  private notificationsEnabled = true;

  attachWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /** Wire config-driven flags. Called from main.ts after each config save. */
  applyConfig(cfg: { notificationsEnabled?: boolean }): void {
    if (typeof cfg.notificationsEnabled === "boolean") {
      this.notificationsEnabled = cfg.notificationsEnabled;
    }
  }

  isRunning(): boolean {
    return this.proc !== null && !this.proc.killed;
  }

  // ─── Preview lifecycle ───────────────────────────────────────────────
  // The HyperFrames dev server runs `npx hyperframes preview` in a
  // composition workspace. Default port 3002, hot-reloads on file changes.
  // We spawn it detached so killing the agent doesn't take the preview down.

  isPreviewRunning(): boolean {
    return this.previewProc !== null && !this.previewProc.killed;
  }

  getPreviewState(): { running: boolean; url: string | null; workspace: string | null } {
    return {
      running: this.isPreviewRunning(),
      url: this.previewUrl,
      workspace: this.previewWorkspace,
    };
  }

  async startPreview(workspacePath: string, port?: number): Promise<{ url: string }> {
    const resolvedPort = port ?? 3002;
    // If a preview is already running for the same workspace, reuse it.
    if (this.isPreviewRunning() && this.previewWorkspace === workspacePath && this.previewUrl) {
      return { url: this.previewUrl };
    }
    // Otherwise tear down the previous one before starting fresh.
    if (this.isPreviewRunning()) {
      await this.stopPreview();
    }

    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const proc = spawn(npx, ["hyperframes", "preview", "--port", String(resolvedPort)], {
      cwd: workspacePath,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, BROWSER: "none" },
    });

    this.previewProc = proc;
    this.previewWorkspace = workspacePath;
    this.previewUrl = `http://localhost:${resolvedPort}`;

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        this.emit({ type: "agent_log", level: "preview", text: line });
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        this.emit({ type: "agent_log", level: "preview-err", text: line });
      }
    });
    proc.on("error", (err) => {
      this.emit({
        type: "error",
        scope: "preview",
        message: `failed to spawn hyperframes preview: ${err.message}`,
        recoverable: true,
      });
      this.previewProc = null;
      this.previewUrl = null;
      this.previewWorkspace = null;
    });
    proc.on("exit", () => {
      this.previewProc = null;
      this.previewUrl = null;
      this.previewWorkspace = null;
    });

    return { url: this.previewUrl };
  }

  async stopPreview(): Promise<void> {
    if (!this.previewProc) return;
    const proc = this.previewProc;
    return new Promise<void>((resolve) => {
      const onExit = () => {
        proc.removeListener("exit", onExit);
        resolve();
      };
      proc.once("exit", onExit);
      proc.kill("SIGTERM");
      const escalation = setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 1500);
      const ceiling = setTimeout(() => {
        proc.removeListener("exit", onExit);
        resolve();
      }, 5000);
      proc.once("exit", () => {
        clearTimeout(escalation);
        clearTimeout(ceiling);
      });
    });
  }

  async generate(req: GenerateRequest, config: AppConfig): Promise<void> {
    if (this.isRunning()) {
      throw new Error("agent is already running — cancel the current run first");
    }

    const agentEntry = resolveAgentEntry();
    if (!agentEntry) {
      throw new Error(
        "agent build not found — run `pnpm agent:build` (looked in agent/dist/index.js)"
      );
    }

    const orgRoot = config.orgProjectsPath ?? defaultOrgRoot();
    const workspaceRoot = config.workspacePath ?? defaultWorkspaceRoot();

    // CRITICAL on Windows: child_process.spawn fails with ENOENT (which looks like
    // "executable not found") when the cwd directory doesn't exist. Make sure the
    // workspace exists before we hand it to spawn.
    if (!existsSync(workspaceRoot)) {
      mkdirSync(workspaceRoot, { recursive: true });
    }

    const proc = spawn(
      process.execPath, // Electron binary, run as Node via ELECTRON_RUN_AS_NODE
      [
        agentEntry,
        "generate-video",
        JSON.stringify({
          projectId: req.projectId,
          videoType: req.videoType,
          formats: req.formats,
          brief: req.brief ?? "",
          // Per-run model override, falling back to the persisted config.
          model: req.model ?? config.selectedModel,
          persona: req.persona ?? config.selectedPersona,
        }),
      ],
      {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
        // Critical on Windows: without windowsHide the spawned electron-as-node
        // process tries to attach a console window which interferes with stdio.
        windowsHide: true,
        env: {
          // Inherit the user's full env so the Claude CLI can find ~/.claude/ credentials
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          ORG_PROJECTS_PATH: orgRoot,
          WORKSPACE_PATH: workspaceRoot,
          TTS_VOICE: config.ttsVoice,
          CLAUDE_MODEL: req.model ?? config.selectedModel,
          // Render preferences — the agent task reads these from env when
          // composing the Stage 6 render commands.
          RENDER_QUALITY: config.renderQuality ?? "standard",
          RENDER_FPS: String(config.renderFps ?? 30),
          ...(config.outputDirectory ? { OUTPUT_DIRECTORY: config.outputDirectory } : {}),
          // Preview port for `npx hyperframes preview` — surfaced so the
          // agent and the bridge agree on the URL.
          PREVIEW_PORT: String(config.previewPort ?? 3002),
        },
      }
    );

    this.proc = proc;
    this.buffer = "";
    this.stderrTail = [];

    proc.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      // Forward every stderr line as an agent_log event AND keep a ring
      // buffer of the recent tail so the agent-exit error has context.
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        this.stderrTail.push(line);
        if (this.stderrTail.length > AgentBridge.STDERR_TAIL_MAX) {
          this.stderrTail.shift();
        }
        this.emit({ type: "agent_log", level: "stderr", text: line });
      }
    });

    proc.on("error", (err) => {
      this.emit({
        type: "error",
        scope: "agent-spawn",
        message: `failed to spawn agent: ${err.message}`,
        recoverable: false,
      });
      this.proc = null;
    });

    proc.on("exit", (code, signal) => {
      // Drain any remaining buffered stdout
      if (this.buffer.trim()) {
        this.parseLine(this.buffer);
        this.buffer = "";
      }
      if (code !== 0 && signal !== "SIGTERM") {
        // Tail the stderr buffer so the user actually sees what failed instead
        // of a bare "exited with code 1". Skip lines we can confidently ignore
        // (Node's fixed deprecation warnings, the SDK's own startup banner).
        const noisyPatterns = [
          /^\(node:\d+\) /,
          /^\(Use `node --trace-deprecation/,
          /^DeprecationWarning:/,
        ];
        const usefulTail = this.stderrTail
          .filter((line) => !noisyPatterns.some((re) => re.test(line)))
          .slice(-6);
        const tail = usefulTail.length > 0
          ? `\n\nlast stderr:\n${usefulTail.join("\n")}`
          : "";
        this.emit({
          type: "error",
          scope: "agent-exit",
          message: `agent exited with code ${code}${signal ? ` (signal ${signal})` : ""}${tail}`,
          recoverable: false,
        });
      }
      this.stderrTail = [];
      this.proc = null;
    });
  }

  async respond(promptId: string, response: string): Promise<void> {
    if (!this.proc) {
      // The renderer raced with a state update — typically the agent crashed
      // at the prompt gate and the user clicked approve/cancel before the
      // fatal-error event cleared the pending prompt. Don't throw through
      // IPC (that becomes an Electron uncaught-handler error in the main
      // process log). Surface a soft recoverable error so the UI can show
      // a helpful nudge and the user can start a fresh run.
      this.emit({
        type: "error",
        scope: "agent-respond",
        message:
          "The agent had already exited when this response arrived. Send a new message to start a fresh run.",
        recoverable: true,
      });
      return;
    }
    const line = JSON.stringify({ type: "prompt-response", id: promptId, response }) + "\n";
    this.proc.stdin.write(line);
  }

  /**
   * Cancel the running agent and resolve once it has actually exited.
   * Awaitable so callers can immediately spawn a replacement run.
   */
  async cancel(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;

    return new Promise<void>((resolve) => {
      const onExit = () => {
        proc.removeListener("exit", onExit);
        resolve();
      };
      proc.once("exit", onExit);

      // Try graceful kill first; escalate to SIGKILL if it doesn't exit in time.
      proc.kill("SIGTERM");
      const escalation = setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 1500);

      // Belt-and-suspenders: if the proc never exits at all, resolve after
      // a hard ceiling so the UI doesn't hang.
      const ceiling = setTimeout(() => {
        proc.removeListener("exit", onExit);
        resolve();
      }, 5000);

      proc.once("exit", () => {
        clearTimeout(escalation);
        clearTimeout(ceiling);
      });
    });
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.trim()) this.parseLine(line);
    }
  }

  private parseLine(line: string): void {
    try {
      const event = JSON.parse(line) as AgentEvent;
      this.emit(event);
    } catch {
      // Not JSON — surface as a raw log line.
      this.emit({ type: "raw", text: line });
    }
  }

  private emit(event: AgentEvent): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("agent-event", event);
    this.maybeNotify(event);
  }

  /**
   * Fire a system notification on important agent events when the user has
   * the window backgrounded. Three trigger points:
   *
   *   - prompt: agent paused for HITL approval
   *   - result.success: render finished
   *   - error (non-recoverable): run died
   *
   * Click → focus the window. Notifications during foreground are suppressed
   * (the user already sees the in-app inline approval card / metrics bar).
   */
  private maybeNotify(event: AgentEvent): void {
    if (!Notification.isSupported()) return;
    if (!this.window || this.window.isDestroyed()) return;
    if (this.window.isFocused()) return;
    if (!this.notificationsEnabled) return;

    let title: string | null = null;
    let body: string | null = null;
    let urgency: "low" | "normal" | "critical" = "normal";

    if (event.type === "prompt") {
      title = "Video Studio · approval requested";
      body = event.question.length > 140 ? event.question.slice(0, 137) + "…" : event.question;
      urgency = "critical";
    } else if (event.type === "result") {
      if (event.status === "success") {
        title = "Video Studio · render complete";
        body = event.message ?? "Your video is ready.";
        urgency = "normal";
      } else if (event.status === "needs_input") {
        title = "Video Studio · waiting on you";
        body = event.message ?? "The agent is paused.";
        urgency = "critical";
      } else {
        title = "Video Studio · run failed";
        body = event.message ?? "The agent stopped without a render.";
        urgency = "normal";
      }
    } else if (event.type === "error" && event.recoverable === false) {
      title = "Video Studio · error";
      body = event.message;
      urgency = "normal";
    }

    if (!title || !body) return;

    const notification = new Notification({
      title,
      body,
      silent: false,
      // Linux only — but ignored elsewhere.
      urgency,
    });

    notification.on("click", () => {
      if (!this.window || this.window.isDestroyed()) return;
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
    });

    notification.show();
  }
}

function resolveAgentEntry(): string | null {
  // Dev: agent/dist/index.js relative to project root
  // Packaged: resourcesPath/app/agent/dist/index.js (electron-builder)
  const candidates = [
    join(app.getAppPath(), "agent", "dist", "index.js"),
    join(process.resourcesPath ?? "", "app", "agent", "dist", "index.js"),
    resolve(__dirname, "..", "..", "agent", "dist", "index.js"),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function defaultOrgRoot(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return join(home, "Documents", "organisation-projects");
}

function defaultWorkspaceRoot(): string {
  return join(app.getPath("userData"), "workspace");
}
