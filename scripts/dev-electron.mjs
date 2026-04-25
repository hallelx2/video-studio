#!/usr/bin/env node
/**
 * Dev runner for the Electron main process.
 *
 * Watches electron/dist/ (the tsc -w output target) and restarts the
 * electron child whenever main.js or its imports change. Without this we'd
 * have to Ctrl+C `pnpm dev` and restart every time we change main / preload
 * / agent-bridge — and that's how we ended up with stale IPC handlers in
 * the running process while the renderer happily HMR'd along.
 *
 * Renderer changes still flow through Vite HMR (no restart needed).
 */
import { spawn } from "node:child_process";
import { watch, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, "electron", "dist");
const mainJs = join(distDir, "main.js");

// The `electron` npm package, when required from a normal Node process,
// resolves to the absolute path of its prebuilt binary (electron.exe on
// Windows, Electron.app/.../Electron on macOS, electron on Linux). Spawning
// this directly is the canonical pattern — and avoids Windows' EINVAL when
// trying to spawn `npx.cmd` from Node 22 without shell:true.
const require = createRequire(import.meta.url);
/** @type {string} */
const electronBinary = require("electron");

let electronProc = null;
let restartTimer = null;
let shuttingDown = false;

async function waitForDist(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await access(mainJs);
      return true;
    } catch {
      // tsc still compiling
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function killCurrent() {
  if (!electronProc) return;
  const proc = electronProc;
  electronProc = null;
  proc.kill(process.platform === "win32" ? undefined : "SIGTERM");
  // On Windows .kill() is best-effort; the process may linger briefly but
  // that's fine — the new electron will bind to a different window handle.
}

async function startElectron() {
  killCurrent();
  const ok = await waitForDist();
  if (!ok) {
    console.error("[dev-electron] dist/main.js never appeared — is tsc -w running?");
    return;
  }
  if (shuttingDown) return;

  console.log("[dev-electron] starting electron…");
  // Critical: explicitly DELETE ELECTRON_RUN_AS_NODE from the inherited env.
  // The agent-bridge sets it when spawning the agent (so the agent runs as
  // Node), and that var leaks into shells and child processes. If it's set
  // when we boot electron itself, electron's binary acts like Node and
  // `require("electron")` returns the path string instead of the app API,
  // which crashes main.js with "Cannot read properties of undefined (reading
  // 'requestSingleInstanceLock')".
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.VITE_DEV_SERVER_URL = "http://localhost:5173";

  electronProc = spawn(electronBinary, ["."], {
    cwd: root,
    stdio: "inherit",
    env,
  });

  electronProc.on("exit", (code, signal) => {
    // If we killed it for a restart, signal will be set. If the user closed
    // the window, code will be 0 and we should propagate.
    if (shuttingDown || signal) return;
    process.exit(code ?? 0);
  });
}

function scheduleRestart(reason) {
  // Debounce — tsc writes several .js files per build pass.
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`[dev-electron] ${reason} — restarting…`);
    startElectron().catch((err) => {
      console.error("[dev-electron] restart failed:", err);
    });
  }, 300);
}

// ─── Boot ─────────────────────────────────────────────────────────────────
await startElectron();

// Watch dist for any .js / .js.map change. fs.watch is platform-flaky on
// recursive: true, but it's good enough for a dev loop.
if (existsSync(distDir)) {
  watch(distDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const f = filename.toString();
    if (!f.endsWith(".js")) return;
    scheduleRestart(`${f} changed`);
  });
} else {
  console.warn(`[dev-electron] watch target ${distDir} doesn't exist yet`);
}

// ─── Shutdown ─────────────────────────────────────────────────────────────
const cleanup = () => {
  shuttingDown = true;
  killCurrent();
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("beforeExit", cleanup);
