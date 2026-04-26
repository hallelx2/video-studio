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

/**
 * Kill the current electron child AND wait for it (and its GPU / renderer /
 * utility children) to fully exit before resolving. On Windows, simply
 * spawning a new electron right after kill() races Chromium's cleanup —
 * the singleton lock, Cache/, and gpu_disk_cache files are still held by
 * the dying child processes for a few hundred ms. Without this wait the
 * new instance hits ERROR:process_singleton_win, ERROR:cache_util_win,
 * ERROR:disk_cache, and refuses to boot.
 */
async function killCurrent() {
  if (!electronProc) return;
  const proc = electronProc;
  electronProc = null;

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    proc.once("exit", finish);
    // SIGTERM first; SIGKILL after 1500ms if it hasn't exited.
    proc.kill(process.platform === "win32" ? undefined : "SIGTERM");
    setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill("SIGKILL");
        } catch {
          // process may already be gone
        }
      }
    }, 1500);
    // Hard ceiling so a wedged process doesn't stall the dev loop forever.
    setTimeout(finish, 5000);
  });

  // Extra grace period for Chromium's child processes (GPU, utility,
  // renderer) to release file locks on Windows. Without this, the new
  // electron beats the cleanup to the singleton/cache files and crashes.
  if (process.platform === "win32") {
    await new Promise((r) => setTimeout(r, 600));
  }
}

async function startElectron() {
  await killCurrent();
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

  // Pipe stdio so we can filter Chromium's harmless DevTools noise (Autofill.*
  // protocol errors that fire whenever DevTools opens against Electron). Pure
  // log spam — no functional impact, but pollutes the dev log.
  electronProc = spawn(electronBinary, ["."], {
    cwd: root,
    stdio: ["inherit", "pipe", "pipe"],
    env,
  });

  pipeFiltered(electronProc.stdout, process.stdout);
  pipeFiltered(electronProc.stderr, process.stderr);

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
const cleanup = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await killCurrent().catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", () => void cleanup());
process.on("SIGTERM", () => void cleanup());
process.on("beforeExit", () => void cleanup());

// ─── Stream filtering ─────────────────────────────────────────────────────
// Chromium emits a few log messages through Electron's stdio that aren't
// actionable in dev — most notoriously the Autofill.enable / Autofill.setAddresses
// protocol errors that fire whenever DevTools opens against Electron (Chromium
// expects an Autofill handler that Electron doesn't ship; -32601 method-not-
// found lands in DevTools' protocol_client.js console, which Electron pipes to
// stdout). Suppress those specific lines, pass everything else through.

const NOISE_PATTERNS = [
  /Request Autofill\.(enable|setAddresses) failed/,
  /'Autofill\.(enable|setAddresses)' wasn't found/,
];

function isNoise(line) {
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(line)) return true;
  }
  return false;
}

/**
 * Pipe a child's output stream to a parent stream, dropping lines that match
 * the known-noise patterns. Buffers partial lines so a chunk that ends mid-
 * line doesn't cause a false-positive on the next chunk.
 */
function pipeFiltered(child, parent) {
  if (!child) return;
  let buffer = "";
  child.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? ""; // keep partial last line for next chunk
    for (const line of lines) {
      if (!isNoise(line)) {
        parent.write(line + "\n");
      }
    }
  });
  child.on("end", () => {
    if (buffer && !isNoise(buffer)) parent.write(buffer);
    buffer = "";
  });
}
