import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { app, type BrowserWindow } from "electron";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { AgentEvent, AppConfig, GenerateRequest } from "./types.js";

/**
 * Owns the lifecycle of the agent child process.
 *
 * Protocol over stdio:
 *   - main → agent: command + JSON payload as CLI args (one shot per run)
 *   - agent → main: NDJSON on stdout, one event per line, parsed to AgentEvent
 *   - agent → main: free-form stderr, forwarded as { type: "agent_log", level: "stderr" }
 *
 * For prompt responses (mid-run), main writes a single JSON line to the agent's stdin.
 * The agent listens for "{ type: 'prompt-response', id, response }\n" lines.
 *
 * One agent run at a time. `generate()` rejects if a run is already active.
 */
export class AgentBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private window: BrowserWindow | null = null;
  private buffer = "";

  attachWindow(win: BrowserWindow): void {
    this.window = win;
  }

  isRunning(): boolean {
    return this.proc !== null && !this.proc.killed;
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
        },
      }
    );

    this.proc = proc;
    this.buffer = "";

    proc.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      // Forward every stderr line as an agent_log event.
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
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
        this.emit({
          type: "error",
          scope: "agent-exit",
          message: `agent exited with code ${code}${signal ? ` (signal ${signal})` : ""}`,
          recoverable: false,
        });
      }
      this.proc = null;
    });
  }

  async respond(promptId: string, response: string): Promise<void> {
    if (!this.proc) throw new Error("no agent run is active");
    const line = JSON.stringify({ type: "prompt-response", id: promptId, response }) + "\n";
    this.proc.stdin.write(line);
  }

  async cancel(): Promise<void> {
    if (!this.proc) return;
    // Try graceful kill first; fall back to SIGKILL after a beat.
    this.proc.kill("SIGTERM");
    const proc = this.proc;
    setTimeout(() => {
      if (proc && !proc.killed) proc.kill("SIGKILL");
    }, 1500);
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
