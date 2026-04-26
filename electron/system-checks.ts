import { app } from "electron";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const execp = promisify(exec);

/**
 * Health checks — surface to the Settings page so the user knows whether
 * their machine has every dependency the agent + HyperFrames pipeline needs.
 *
 * Each tool returns a HealthEntry with:
 *   ok        — is it usable right now?
 *   version   — short version string for display ("1.0.27", "20.18.3")
 *   path      — resolved binary path (when discoverable)
 *   note      — human-readable detail (used for missing-tool install hints)
 */

export type ToolKey =
  | "node"
  | "claude"
  | "hyperframes"
  | "ffmpeg"
  | "git"
  | "electron"
  | "auth";

export interface HealthEntry {
  key: ToolKey;
  label: string;
  /** Whether this tool is REQUIRED for the app's core flow. */
  required: boolean;
  ok: boolean;
  version: string | null;
  path: string | null;
  note: string | null;
}

export interface HealthReport {
  checkedAt: number;
  entries: HealthEntry[];
}

/** Run `cmd args` with a small timeout, return trimmed stdout or null. */
async function tryCommand(cmd: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const { stdout } = await execp(cmd, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1 << 20,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** Resolve `where`/`which` for a binary. */
async function resolveBinary(name: string): Promise<string | null> {
  const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
  const out = await tryCommand(cmd, 2500);
  if (!out) return null;
  // `where` can return multiple lines on Windows; pick the first reasonable one.
  const first = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
  return first ?? null;
}

// ─── Per-tool checks ──────────────────────────────────────────────────────

async function checkNode(): Promise<HealthEntry> {
  const version = process.versions.node;
  const path = process.execPath;
  // We're running on Node (Electron's bundled Node), so this is always ok.
  // The relevant question for Settings is "is your version recent enough?"
  const major = parseInt(version.split(".")[0], 10);
  const ok = major >= 20;
  return {
    key: "node",
    label: "Node",
    required: true,
    ok,
    version,
    path,
    note: ok
      ? null
      : "Node 20+ is recommended; older versions may break the agent build pipeline.",
  };
}

async function checkClaude(): Promise<HealthEntry> {
  const path = await resolveBinary(process.platform === "win32" ? "claude" : "claude");
  if (!path) {
    return {
      key: "claude",
      label: "Claude Code CLI",
      required: true,
      ok: false,
      version: null,
      path: null,
      note: "Install with `npm i -g @anthropic-ai/claude-code` and run `claude login` once.",
    };
  }
  const version = await tryCommand(`"${path}" --version`);
  return {
    key: "claude",
    label: "Claude Code CLI",
    required: true,
    ok: true,
    version: version?.split(/\s+/)[0] ?? null,
    path,
    note: null,
  };
}

async function checkAuth(): Promise<HealthEntry> {
  // Look for ~/.claude/ creds — what the SDK auto-detects.
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const claudeDir = join(home, ".claude");
  try {
    await fs.access(claudeDir);
    return {
      key: "auth",
      label: "Claude subscription auth",
      required: true,
      ok: true,
      version: null,
      path: claudeDir,
      note: null,
    };
  } catch {
    return {
      key: "auth",
      label: "Claude subscription auth",
      required: true,
      ok: false,
      version: null,
      path: null,
      note: "Run `claude login` to sign in with your Claude Pro/Max subscription.",
    };
  }
}

async function checkHyperFrames(): Promise<HealthEntry> {
  // hyperframes is invoked via `npx hyperframes`, so we don't need a global
  // install — but we do need the package to be resolvable in the user's
  // environment. Try the version command and trust that.
  const version = await tryCommand(`npx hyperframes --version`, 8000);
  if (!version) {
    return {
      key: "hyperframes",
      label: "HyperFrames CLI",
      required: true,
      ok: false,
      version: null,
      path: null,
      note: "First run will download HyperFrames via npx; manually run `npx hyperframes doctor` to pre-warm.",
    };
  }
  return {
    key: "hyperframes",
    label: "HyperFrames CLI",
    required: true,
    ok: true,
    version: version.replace(/^v/, "").split(/\s+/)[0] ?? null,
    path: null,
    note: null,
  };
}

async function checkFfmpeg(): Promise<HealthEntry> {
  const path = await resolveBinary("ffmpeg");
  if (!path) {
    return {
      key: "ffmpeg",
      label: "FFmpeg",
      required: true,
      ok: false,
      version: null,
      path: null,
      note: "HyperFrames render needs FFmpeg. Install from https://ffmpeg.org/download.html and add it to PATH.",
    };
  }
  const out = await tryCommand(`"${path}" -version`);
  const m = out?.match(/ffmpeg version (\S+)/);
  return {
    key: "ffmpeg",
    label: "FFmpeg",
    required: true,
    ok: true,
    version: m?.[1] ?? null,
    path,
    note: null,
  };
}

async function checkGit(): Promise<HealthEntry> {
  const path = await resolveBinary("git");
  if (!path) {
    return {
      key: "git",
      label: "Git",
      required: false,
      ok: false,
      version: null,
      path: null,
      note: "Optional — only needed if you want the agent to commit generated artifacts.",
    };
  }
  const out = await tryCommand(`"${path}" --version`);
  const m = out?.match(/git version (\S+)/);
  return {
    key: "git",
    label: "Git",
    required: false,
    ok: true,
    version: m?.[1] ?? null,
    path,
    note: null,
  };
}

async function checkElectron(): Promise<HealthEntry> {
  return {
    key: "electron",
    label: "Electron",
    required: true,
    ok: true,
    version: process.versions.electron ?? null,
    path: process.execPath,
    note: null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function runHealthChecks(): Promise<HealthReport> {
  // Run all checks in parallel — most are quick (a single child_process spawn).
  const entries = await Promise.all([
    checkElectron(),
    checkNode(),
    checkClaude(),
    checkAuth(),
    checkHyperFrames(),
    checkFfmpeg(),
    checkGit(),
  ]);
  return {
    checkedAt: Date.now(),
    entries,
  };
}

// Suppress unused-symbol on import — kept for a future "diagnostics report"
// export that includes app version + platform.
void app;
