import {
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { app, Notification, type BrowserWindow } from "electron";
import { connect as netConnect } from "node:net";
import { resolve, join, dirname, delimiter } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { AgentEvent, AppConfig, GenerateRequest } from "./types.js";

/**
 * `hyperframes preview` unconditionally calls `import("open").then(m =>
 * m.default(url))` after the studio comes up — there's no `--no-open` flag
 * and `BROWSER=none` isn't honored by the `open` package. We don't want a
 * second window popping next to our in-app PreviewPanel iframe, so we
 * inject a tiny ESM loader hook via `NODE_OPTIONS=--import` that resolves
 * `open` to a no-op stub. Files are written into Electron's userData dir
 * on first use so this works in dev, in asar, and on any platform without
 * extra build wiring.
 */
function ensurePreviewNoOpenHook(): string {
  const dir = join(app.getPath("userData"), "preview-no-open");
  mkdirSync(dir, { recursive: true });
  const stubPath = join(dir, "stub.mjs");
  const loaderPath = join(dir, "loader.mjs");
  const registerPath = join(dir, "register.mjs");
  // Stub: `open` returns a child-process-shaped object in the real lib.
  // Hyperframes ignores the return value, so an unref-able dummy is enough.
  if (!existsSync(stubPath)) {
    writeFileSync(
      stubPath,
      `export default async function open() {\n  return { unref() {}, on() {}, kill() {} };\n}\nexport const openApp = open;\n`,
      "utf8"
    );
  }
  if (!existsSync(loaderPath)) {
    writeFileSync(
      loaderPath,
      `const STUB = new URL("./stub.mjs", import.meta.url).href;\nexport async function resolve(specifier, context, nextResolve) {\n  if (specifier === "open") return { url: STUB, shortCircuit: true, format: "module" };\n  return nextResolve(specifier, context);\n}\n`,
      "utf8"
    );
  }
  if (!existsSync(registerPath)) {
    writeFileSync(
      registerPath,
      `import { register } from "node:module";\nregister("./loader.mjs", import.meta.url);\n`,
      "utf8"
    );
  }
  return registerPath;
}

/**
 * Build the env-var overrides that pin the Python interpreter when the user
 * has set `pythonBin` in config. Two levers — set together so we cover any
 * tool's discovery strategy:
 *
 *   - `PYTHON=<absolute-path>`: honored by node-python bridges, conda
 *     wrappers, and most "find me a Python" libs.
 *   - `PATH` with `dirname(pythonBin)` prepended: so anything that just
 *     calls `python` resolves to this binary first, regardless of whether
 *     it reads `PYTHON`.
 *
 * Returns an empty object when `pythonBin` is null so the spread is a no-op.
 */
function applyPythonBin(pythonBin: string | null | undefined): NodeJS.ProcessEnv {
  if (!pythonBin) return {};
  const binDir = dirname(pythonBin);
  const currentPath = process.env.PATH ?? "";
  return {
    PYTHON: pythonBin,
    PATH: `${binDir}${delimiter}${currentPath}`,
  };
}

/**
 * Probe localhost:<port> until something accepts a TCP connection or we run
 * out of time. Used so startPreview() can return a URL the iframe can load
 * immediately instead of racing the dev server's bind() and showing a
 * Chrome ERR_CONNECTION_REFUSED splash.
 */
/**
 * Resolve when the spawned process's stdout emits a line matching `pattern`.
 * Used to know when HyperFrames preview is past its first-pass bundle —
 * `bind()` returns long before the composition is actually serveable, so
 * relying on a TCP probe alone gives the iframe a half-built page.
 *
 * Listener stays attached even after resolution so it doesn't interfere
 * with the existing data handler downstream — we just stop reacting after
 * the first match.
 */
function waitForStdoutMarker(
  proc: ChildProcess,
  pattern: RegExp,
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolveMarker, rejectMarker) => {
    if (!proc.stdout) {
      // No stdout to watch — degrade gracefully, let the TCP probe handle it.
      resolveMarker();
      return;
    }
    let buffer = "";
    let settled = false;

    const onData = (chunk: Buffer) => {
      if (settled) return;
      buffer += chunk.toString("utf8");
      // Only test the most recent ~16KB so this never grows unbounded.
      if (buffer.length > 16384) buffer = buffer.slice(-16384);
      if (pattern.test(buffer)) {
        settled = true;
        clearTimeout(timer);
        proc.stdout?.off("data", onData);
        resolveMarker();
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.stdout?.off("data", onData);
      rejectMarker(
        new Error(
          `preview dev server didn't print its ready marker within ${Math.round(
            timeoutMs / 1000
          )}s`
        )
      );
    }, timeoutMs);

    proc.stdout.on("data", onData);
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Hold the last connect-error message as a plain string so TS's flow
  // narrowing through the closure boundary stays simple.
  let lastErrMsg: string | null = null;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolveProbe) => {
      const sock = netConnect({ port, host: "127.0.0.1" });
      const settle = (ok: boolean) => {
        sock.removeAllListeners();
        sock.destroy();
        resolveProbe(ok);
      };
      sock.once("connect", () => settle(true));
      sock.once("error", (err: Error) => {
        lastErrMsg = err.message;
        settle(false);
      });
      // Per-attempt cap so a hung connection doesn't eat the whole budget.
      setTimeout(() => settle(false), 500);
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `preview dev server didn't accept a connection on port ${port} within ${Math.round(
      timeoutMs / 1000
    )}s${lastErrMsg ? ` (last: ${lastErrMsg})` : ""}`
  );
}

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
  /** Listeners registered by runTool() so it can resolve when a
   *  matching tool_finished event arrives. Fired by parseLine when an
   *  AgentEvent of that type is parsed. */
  private toolListeners = new Set<(event: AgentEvent) => void>();
  // Buffer enough stderr to keep the actual error message even when the
  // stack trace is many frames deep. A typical Node fatal looks like:
  //   Error: <real cause>
  //     at Module.load ...
  //     at Module._load ...
  //     at c._load ...
  //     at Function.executeUserEntryPoint ...
  //     at node:internal/main/run_main_module ...
  //   Node.js v20.18.3
  // — that's already 7 lines without any user-frame output. Keep ~50 so
  // even pathological traces surface the cause line.
  private static readonly STDERR_TAIL_MAX = 50;
  /** Set to true when the agent emits its own fatal error — used to suppress
   *  the bare "agent exited with code 1" follow-up that otherwise duplicates
   *  the same news in the activity stream. */
  private agentReportedFatal = false;
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

  async startPreview(
    workspacePath: string,
    port?: number,
    pythonBin?: string | null
  ): Promise<{ url: string }> {
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
    const registerHook = ensurePreviewNoOpenHook();
    const registerHookUrl = pathToFileURL(registerHook).href;
    // Preserve any existing NODE_OPTIONS — pnpm/corepack sometimes set them.
    const existingNodeOptions = process.env.NODE_OPTIONS ?? "";
    const proc = spawn(npx, ["hyperframes", "preview", "--port", String(resolvedPort)], {
      cwd: workspacePath,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // Node 22 on Windows refuses to spawn `.cmd` shims directly with a
      // bare EINVAL — the file isn't a real PE binary. Run through the
      // shell so cmd.exe resolves the .cmd shim correctly.
      shell: process.platform === "win32",
      env: {
        ...process.env,
        BROWSER: "none",
        // Suppress hyperframes' built-in `open(url)` call so we don't pop
        // a browser window alongside the in-app PreviewPanel iframe.
        NODE_OPTIONS: `${existingNodeOptions} --import="${registerHookUrl}"`.trim(),
        // Same Python pin we apply to the agent spawn — preview's bundler
        // can also shell out to Python for asset processing.
        ...applyPythonBin(pythonBin ?? null),
      },
    });

    this.previewProc = proc;
    this.previewWorkspace = workspacePath;
    const localUrl = `http://localhost:${resolvedPort}`;
    this.previewUrl = localUrl;

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
      // Hyperframes' "already-running" branch prints status then exits even
      // though the studio server (a prior instance) is still bound to the
      // port. Don't null state on exit if the port is still answering — the
      // iframe is happily talking to that older server. stopPreview() handles
      // the explicit teardown path.
      this.previewProc = null;
      void (async () => {
        try {
          await waitForPort(resolvedPort, 1500);
        } catch {
          this.previewUrl = null;
          this.previewWorkspace = null;
        }
      })();
    });

    // Two-phase readiness probe — the TCP bind opens the port long before
    // the bundler has actually rendered the composition, so an iframe
    // loaded too early sees a half-built page (or the bundler's loading
    // splash). Wait for whichever signal arrives last:
    //   1. TCP `connect()` succeeds (port is bound).
    //   2. HyperFrames prints its "Studio running" / "Studio http://"
    //      marker on stdout (the bundler is past first-pass build).
    // 60s budget covers a cold start where HyperFrames downloads its
    // bundled Chromium.
    // Match either "Studio running" / "Studio  http://..." (fresh start) or
    // "Already running" / "Reusing existing server" (port already held by an
    // earlier hyperframes instance — that one stays up and we just attach).
    const readyMarker = waitForStdoutMarker(
      proc,
      /(Studio\s+(running|http))|Already running|Reusing existing/i,
      60000
    );
    try {
      await Promise.all([waitForPort(resolvedPort, 60000), readyMarker]);
    } catch (err) {
      // Probe timed out or hard-failed — kill the spawned proc so we don't
      // leak it, and surface the timeout as a structured error the renderer
      // can show in the activity stream.
      if (!proc.killed) proc.kill();
      this.previewProc = null;
      this.previewUrl = null;
      this.previewWorkspace = null;
      throw err;
    }

    return { url: localUrl };
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
          // Per-session workspace scoping. Without this every session in
          // the same project edits the same script.json / compositions /
          // renders, and resume detection bleeds artifacts across threads.
          sessionId: req.sessionId,
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
          // Pin the Python interpreter for hyperframes tts (and anything
          // else that shells into Python). Honored by tools that read
          // `PYTHON` env var, and the dirname is prepended to PATH so
          // tools that just call `python` find it first too.
          ...applyPythonBin(config.pythonBin),
        },
      }
    );

    this.proc = proc;
    this.buffer = "";
    this.stderrTail = [];
    this.agentReportedFatal = false;

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
      if (code !== 0 && signal !== "SIGTERM" && !this.agentReportedFatal) {
        // Only emit the bare exit marker if the agent didn't already explain
        // the failure with its own error event. Otherwise we'd be double-
        // logging the same news ("API timeout" + "agent exited with code 1").
        const noisyPatterns = [
          /^\(node:\d+\) /,
          /^\(Use `node --trace-deprecation/,
          /^DeprecationWarning:/,
        ];
        // Strip stack frames AND noise, then look back to find the
        // first non-trace line (which is almost always the actual error
        // headline). Surface that headline + a few following frames for
        // context. Without this filter, deep traces push the real
        // "Error: ..." message out of the visible tail entirely.
        const stackFrameRe = /^\s*at /;
        const filtered = this.stderrTail.filter(
          (line) => !noisyPatterns.some((re) => re.test(line))
        );
        const lastNonFrameIdx = (() => {
          for (let i = filtered.length - 1; i >= 0; i--) {
            if (!stackFrameRe.test(filtered[i]) && filtered[i].trim().length > 0) {
              // Walk back further while we're still in a contiguous
              // non-trace block (e.g. multi-line error message).
              let start = i;
              while (
                start > 0 &&
                !stackFrameRe.test(filtered[start - 1]) &&
                filtered[start - 1].trim().length > 0
              ) {
                start -= 1;
              }
              return start;
            }
          }
          return Math.max(0, filtered.length - 6);
        })();
        const usefulTail = filtered.slice(lastNonFrameIdx, lastNonFrameIdx + 8);
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
      this.agentReportedFatal = false;
      this.proc = null;
    });
  }

  /**
   * Direct-invoke a single tool from the agent's TOOLS registry. Spawns
   * a short-lived agent process with `run-tool <json>` args; events from
   * the tool stream through the same agent-event IPC channel as the
   * macro task, and the resolved promise carries the tool_finished
   * status (or "error" if the process exits without one).
   *
   * Refuses to start when a macro generate is already running on this
   * bridge — same single-process invariant as the existing generate()
   * method, just for the tool surface.
   */
  async runTool(
    req: {
      projectId: string;
      sessionId: string;
      toolName: string;
      input: unknown;
      model?: string;
      persona?: string;
    },
    config: AppConfig
  ): Promise<{
    status: "ok" | "skipped" | "cancelled" | "needs-approval" | "error";
    message?: string;
  }> {
    if (this.isRunning()) {
      return {
        status: "error",
        message: "Agent is already running — cancel the current run first.",
      };
    }

    const agentEntry = resolveAgentEntry();
    if (!agentEntry) {
      return {
        status: "error",
        message: "Agent build not found — run `pnpm agent:build`.",
      };
    }

    const orgRoot = config.orgProjectsPath ?? defaultOrgRoot();
    const workspaceRoot = config.workspacePath ?? defaultWorkspaceRoot();
    if (!existsSync(workspaceRoot)) mkdirSync(workspaceRoot, { recursive: true });

    return await new Promise((resolve) => {
      let resolved = false;
      const toolFinishedListener = (event: AgentEvent) => {
        if (resolved) return;
        if (event.type === "tool_finished" && event.name === req.toolName) {
          resolved = true;
          resolve({ status: event.status, message: event.message });
        }
      };
      this.toolListeners.add(toolFinishedListener);

      const proc = spawn(
        process.execPath,
        [
          agentEntry,
          "run-tool",
          JSON.stringify({
            projectId: req.projectId,
            sessionId: req.sessionId,
            toolName: req.toolName,
            input: req.input,
            model: req.model ?? config.selectedModel,
            persona: req.persona ?? config.selectedPersona,
          }),
        ],
        {
          cwd: workspaceRoot,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            ORG_PROJECTS_PATH: orgRoot,
            WORKSPACE_PATH: workspaceRoot,
            TTS_VOICE: config.ttsVoice,
            CLAUDE_MODEL: req.model ?? config.selectedModel,
            RENDER_QUALITY: config.renderQuality ?? "standard",
            RENDER_FPS: String(config.renderFps ?? 30),
            ...(config.outputDirectory
              ? { OUTPUT_DIRECTORY: config.outputDirectory }
              : {}),
            PREVIEW_PORT: String(config.previewPort ?? 3002),
            ...applyPythonBin(config.pythonBin),
          },
        }
      );

      this.proc = proc;
      this.buffer = "";

      proc.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        for (const line of text.split(/\r?\n/).filter(Boolean)) {
          this.stderrTail.push(line);
          if (this.stderrTail.length > AgentBridge.STDERR_TAIL_MAX) {
            this.stderrTail.shift();
          }
          this.emit({ type: "agent_log", level: "stderr", text: line });
        }
      });
      proc.on("exit", () => {
        this.proc = null;
        this.toolListeners.delete(toolFinishedListener);
        if (!resolved) {
          resolved = true;
          resolve({
            status: "error",
            message: "Tool process exited without a tool_finished event.",
          });
        }
      });
      proc.on("error", (err) => {
        if (resolved) return;
        resolved = true;
        this.toolListeners.delete(toolFinishedListener);
        resolve({ status: "error", message: err.message });
      });
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
    if (!this.proc) {
      // No live process to kill — but the renderer's derived agent state
      // may still show "running" because no terminal event was ever
      // emitted (e.g. agent died silently while parked at an approval
      // gate). Synthesize a needs_input result so the timeline transitions
      // out of "running" and the Stop button visibly resolves the run.
      this.emit({
        type: "result",
        status: "needs_input",
        message: "Stopped — send a new message to start a fresh run.",
      });
      return;
    }
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
      // If the agent emits its own non-recoverable error, remember it so we
      // can suppress the redundant "agent exited with code N" follow-up
      // when the process tears down a moment later.
      if (event.type === "error" && event.recoverable === false) {
        this.agentReportedFatal = true;
      }
      // Fan tool_finished out to any in-flight runTool listeners so the
      // IPC promise resolves with the actual tool result.
      if (event.type === "tool_finished") {
        for (const listener of this.toolListeners) {
          try {
            listener(event);
          } catch {
            // listener errors must never derail forwarding
          }
        }
      }
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
