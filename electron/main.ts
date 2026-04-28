import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from "electron";
import { join, dirname, extname } from "node:path";
import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { AgentBridge } from "./agent-bridge.js";
import { loadConfig, saveConfig } from "./config.js";
import { listProjects } from "./projects.js";
import {
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  renameSession,
  saveSession,
} from "./session-store.js";
import { runHealthChecks } from "./system-checks.js";
import { buildAppMenu } from "./app-menu.js";
import type {
  AgentEvent,
  AppConfig,
  GenerateRequest,
  SessionScaffold,
} from "./types.js";

// __dirname is provided by CommonJS — no fileURLToPath needed.

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const agent = new AgentBridge();
let mainWindow: BrowserWindow | null = null;

/**
 * Resolve the runtime icon path. In dev, electron loads from the project
 * tree; in prod the file is packed into the asar at build/icon.png. Both
 * resolve via the same `..\..\build\icon.png` traversal because
 * electron/dist/main.js is two levels below the project root either way.
 *
 * On macOS the .icns bundled by electron-builder takes precedence for the
 * dock; on Windows the .exe icon is what shows in the taskbar. This setting
 * mostly affects the in-window title bar (Linux/Windows dev) and the
 * alt-tab thumbnail.
 */
function getIconPath(): string {
  return join(__dirname, "..", "..", "build", "icon.png");
}

/** Apply config-driven flags (notifications etc) to the bridge. Called on
 *  bootstrap and after every config:save. */
async function syncConfigToBridge(): Promise<void> {
  try {
    const cfg = await loadConfig();
    agent.applyConfig({ notificationsEnabled: cfg.notificationsEnabled });
  } catch {
    // first-run / corrupt config — bridge keeps its defaults
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false, // wait for ready-to-show, avoids flash of white
    backgroundColor: "#0A0A0B", // ink — matches DESIGN.md so first paint isn't a white flash
    icon: getIconPath(), // lens-and-play monogram (build/icon.svg → build/icon.png)
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses node imports
    },
  });

  agent.attachWindow(mainWindow);

  // Keep all preview-iframe navigation inside the app. Without these,
  // any `target="_blank"`, `window.open(...)`, or framebusting redirect
  // inside the HyperFrames dev server (the iframe in PreviewPanel) gets
  // forwarded to the OS default browser by Electron's defaults. The user
  // expects the preview to stay in-app — these guards enforce that.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Genuine outbound links (docs, GitHub, etc.) — explicitly route
    // through openExternal so the user still gets them in their browser.
    // Localhost preview URLs and studio-media paths stay in-app.
    if (
      url.startsWith("http://localhost") ||
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("studio-media:")
    ) {
      return { action: "deny" };
    }
    void shell.openExternal(url).catch(() => undefined);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Top-level navigation away from the renderer is never wanted —
    // we're a single-page app. Block it. (HMR uses the existing URL,
    // which doesn't trigger will-navigate.)
    if (isDev && VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) {
      return;
    }
    event.preventDefault();
    if (url.startsWith("http")) {
      void shell.openExternal(url).catch(() => undefined);
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev && VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    // DevTools no longer auto-open in dev — too noisy when you just want to
    // see the app. Toggle manually via the View menu (Ctrl+Shift+I / F12),
    // or set OPEN_DEVTOOLS=1 in the env if you want them back on launch.
    if (process.env.OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    // electron/dist/main.js → ../.. → project root → dist/renderer/index.html
    mainWindow.loadFile(join(__dirname, "..", "..", "dist", "renderer", "index.html"));
  }
}

// ─── Custom media protocol ────────────────────────────────────────────────
// `<video src="studio-media:///...">` lets the renderer play rendered MP4s
// inside the app instead of handing them off to the OS player. The previous
// pass piped through `net.fetch(file://...)` which doesn't preserve byte-
// range semantics, and Chromium's <video> element refused to play because
// it couldn't seek and the Content-Type was missing. This handler streams
// the file directly with proper Content-Type, Content-Length, and Range
// support so playback + scrubbing both work.
//
// URLs look like `studio-media:///<urlencoded-absolute-path>` so Windows
// drive letters and special characters survive URL parsing untouched.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "studio-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

const MEDIA_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function registerMediaProtocol(): void {
  protocol.handle("studio-media", async (request) => {
    const method = request.method;
    const rawUrl = request.url;
    const range = request.headers.get("range");
    let decoded = "";
    try {
      const url = new URL(rawUrl);
      // Pathname is `/<encoded-absolute-path>`. Strip leading slash, decode.
      // We tolerate both `studio-media:///<path>` (empty host, legacy) and
      // `studio-media://local/<path>` (proper host) without branching.
      decoded = decodeURIComponent(url.pathname.replace(/^\//, ""));
      console.log(
        `[studio-media] ${method} host=${url.host || "-"} range=${range ?? "-"} path=${decoded}`
      );
      const stat = await fs.stat(decoded);
      if (!stat.isFile()) {
        console.warn(`[studio-media] not-a-file: ${decoded}`);
        return new Response("not a file", { status: 404 });
      }
      const total = stat.size;
      const ext = extname(decoded).toLowerCase();
      const mime = MEDIA_MIME[ext] ?? "application/octet-stream";

      // HEAD: respond with headers only, no body. Chromium's media stack
      // sometimes preflights with HEAD; returning a body stream there has
      // been observed to flatten into MEDIA_ERR_SRC_NOT_SUPPORTED.
      if (method === "HEAD") {
        console.log(`[studio-media] HEAD 200 size=${total} mime=${mime}`);
        return new Response(null, {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(total),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
          },
        });
      }

      // Honor Range — Chromium's <video> sends `bytes=N-` for seeking.
      // Without 206 + Content-Range support, the player can't scrub.
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
          if (start >= total || start > end) {
            console.warn(
              `[studio-media] 416 start=${start} end=${end} total=${total}`
            );
            return new Response("range not satisfiable", {
              status: 416,
              headers: { "Content-Range": `bytes */${total}` },
            });
          }
          const length = end - start + 1;
          const nodeStream = createReadStream(decoded, { start, end });
          nodeStream.on("error", (err) => {
            console.error(
              `[studio-media] stream error (range) path=${decoded} ${(err as Error).message}`
            );
          });
          const stream = Readable.toWeb(
            nodeStream
          ) as unknown as ReadableStream<Uint8Array>;
          console.log(
            `[studio-media] 206 ${start}-${end}/${total} length=${length}`
          );
          return new Response(stream, {
            status: 206,
            headers: {
              "Content-Type": mime,
              "Content-Length": String(length),
              "Content-Range": `bytes ${start}-${end}/${total}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "no-store",
            },
          });
        }
      }

      const nodeStream = createReadStream(decoded);
      nodeStream.on("error", (err) => {
        console.error(
          `[studio-media] stream error (full) path=${decoded} ${(err as Error).message}`
        );
      });
      const stream = Readable.toWeb(
        nodeStream
      ) as unknown as ReadableStream<Uint8Array>;
      console.log(`[studio-media] 200 size=${total} mime=${mime}`);
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(total),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[studio-media] handler threw url=${rawUrl} decoded=${decoded} :: ${msg}`
      );
      return new Response(`media error: ${msg}`, {
        status: err instanceof Error && err.message.includes("ENOENT") ? 404 : 500,
      });
    }
  });
}

// ─── Single-instance lock ──────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  registerIpcHandlers();
  registerMediaProtocol();
  await syncConfigToBridge();
  // Replace Electron's default menu with our own so File/Edit/View/Window
  // are on-brand and ⌘+ / ⌘- / ⌘0 zoom shortcuts are wired natively.
  buildAppMenu(() => mainWindow);
  createWindow();

  app.on("activate", () => {
    // macOS — re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  if (agent.isRunning()) await agent.cancel();
  if (agent.isPreviewRunning()) await agent.stopPreview();
});

// ─── IPC handlers ──────────────────────────────────────────────────────────
function registerIpcHandlers(): void {
  ipcMain.handle("config:get", async () => loadConfig());

  ipcMain.handle("config:save", async (_, config: AppConfig) => {
    await saveConfig(config);
    // Live-apply config-driven flags (notifications etc) to the bridge so
    // the renderer doesn't need an extra IPC round-trip after toggling.
    agent.applyConfig({ notificationsEnabled: config.notificationsEnabled });
  });

  ipcMain.handle("projects:list", async () => {
    const config = await loadConfig();
    if (!config.orgProjectsPath) return [];
    return listProjects(config.orgProjectsPath);
  });

  ipcMain.handle(
    "projects:set-design-default",
    async (_, projectId: string, content: string) => {
      const config = await loadConfig();
      if (!config.orgProjectsPath) {
        throw new Error("Projects folder not configured — set it in Settings first.");
      }
      // Defensive: refuse path-traversal attempts. projectId should be a
      // bare folder name, no slashes, no .. — listProjects produces these.
      if (
        !projectId ||
        projectId.includes("/") ||
        projectId.includes("\\") ||
        projectId.includes("..")
      ) {
        throw new Error(`Invalid projectId: ${projectId}`);
      }
      const target = join(config.orgProjectsPath, projectId, "DESIGN.md");
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      return { path: target };
    }
  );

  ipcMain.handle("agent:generate", async (_, req: GenerateRequest) => {
    const config = await loadConfig();
    await agent.generate(req, config);
  });

  ipcMain.handle("agent:respond", async (_, promptId: string, response: string) => {
    await agent.respond(promptId, response);
  });

  ipcMain.handle("agent:cancel", async () => agent.cancel());

  ipcMain.handle("agent:is-running", async () => agent.isRunning());

  // Wipe cached artifacts for a pipeline stage so the resume detector treats
  // it (and everything downstream) as not-done. Used by the chat slash
  // commands /renarrate, /recompose, /rerender, /redraft so the user can
  // retry a single stage without manually deleting files. Cascade rules
  // mirror detectResume() in agent/src/tasks/generate-video.ts:
  //
  //   redraft   → script.json + manifest + narration WAVs + compositions + outputs
  //   renarrate → manifest + narration WAVs/hashes + per-aspect narration + outputs
  //   recompose → per-aspect index.html + outputs
  //   rerender  → outputs only
  //
  // Returns the list of files actually removed so the renderer can show a
  // toast / agent_log entry confirming the wipe.
  ipcMain.handle(
    "agent:invalidate-stage",
    async (
      _,
      projectId: string,
      stage: "redraft" | "renarrate" | "recompose" | "rerender"
    ): Promise<{ removed: string[] }> => {
      if (
        !projectId ||
        projectId.includes("/") ||
        projectId.includes("\\") ||
        projectId.includes("..")
      ) {
        throw new Error(`Invalid projectId: ${projectId}`);
      }
      const config = await loadConfig();
      const workspaceRoot =
        config.workspacePath ?? join(app.getPath("userData"), "workspace");
      const projectWs = join(workspaceRoot, projectId);

      const removed: string[] = [];
      const tryRm = async (path: string): Promise<void> => {
        try {
          await fs.rm(path, { recursive: true, force: true });
          removed.push(path);
        } catch {
          // best-effort: not-found / locked is fine
        }
      };
      const tryRmGlob = async (
        dir: string,
        predicate: (name: string) => boolean
      ): Promise<void> => {
        let entries: string[] = [];
        try {
          entries = await fs.readdir(dir);
        } catch {
          return;
        }
        await Promise.all(
          entries.filter(predicate).map((name) => tryRm(join(dir, name)))
        );
      };

      // Outputs are always cleared — every stage produces them last.
      const outputDir = join(projectWs, "output");
      await tryRmGlob(outputDir, (n) => /\.(mp4|webm|mov)$/i.test(n));

      // List aspect dirs (1080x1080, 1920x1080, 1080x1920, …) so we can wipe
      // per-aspect artifacts uniformly. They're the only top-level dirs that
      // match WxH.
      let entries: string[] = [];
      try {
        entries = await fs.readdir(projectWs);
      } catch {
        // Workspace doesn't exist yet — nothing to do, return empty list.
        return { removed };
      }
      const aspectDirs = entries.filter((n) => /^\d+x\d+$/.test(n));

      if (stage === "rerender") {
        // outputs already cleared above
        return { removed };
      }

      if (stage === "recompose" || stage === "renarrate" || stage === "redraft") {
        for (const aspect of aspectDirs) {
          await tryRm(join(projectWs, aspect, "index.html"));
        }
      }

      if (stage === "renarrate" || stage === "redraft") {
        await tryRm(join(projectWs, "manifest.json"));
        const narrationDir = join(projectWs, "narration");
        await tryRmGlob(narrationDir, (n) => /\.(wav|hash)$/i.test(n));
        for (const aspect of aspectDirs) {
          await tryRmGlob(
            join(projectWs, aspect, "narration"),
            (n) => /\.(wav|hash)$/i.test(n)
          );
        }
      }

      if (stage === "redraft") {
        await tryRm(join(projectWs, "script.json"));
      }

      return { removed };
    }
  );

  ipcMain.handle("fs:read-text", async (_, path: string) => {
    try {
      return await fs.readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  });

  ipcMain.handle("fs:write-text", async (_, path: string, content: string) => {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, content, "utf8");
  });

  // Lightweight existence + size probe — used by the inline video player's
  // error fallback to distinguish "file isn't on disk yet" from "file is
  // corrupt / wrong codec". The studio-media:// protocol's response code
  // gets flattened to MEDIA_ERR_SRC_NOT_SUPPORTED by Chromium, so the
  // renderer needs an out-of-band way to see the underlying truth.
  // Transcode an MP4 in place into a strictly browser-safe profile so the
  // in-app <video> player can decode it. The agent's Stage 6 already does
  // this for new renders, but existing files that were rendered with the
  // old (HEVC / yuv444p) settings need to be fixed without re-running the
  // whole pipeline. Writes to <input>.tmp.mp4 then atomically renames so a
  // failed transcode doesn't destroy the original.
  ipcMain.handle("media:transcode-web-safe", async (_, inputPath: string) => {
    const tmpPath = `${inputPath}.tmp.mp4`;
    // Baseline profile + level 3.1 is the widest-compatibility H.264
    // configuration — every Chromium build, every iOS device, every
    // LinkedIn upload pipeline accepts it. We pay a tiny size penalty
    // versus high@4.0 but lose all the "won't play" edge cases.
    // -ac 2 forces stereo audio (some compositions emit mono which
    // Chromium occasionally rejects in MP4 containers).
    // -map 0:v:0 -map 0:a:0? maps first video + optional first audio so
    // we don't accidentally carry weird side data tracks across.
    const args = [
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c:v", "libx264",
      "-profile:v", "baseline",
      "-level", "3.1",
      "-pix_fmt", "yuv420p",
      "-preset", "fast",
      "-crf", "20",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-ar", "44100",
      "-ac", "2",
      "-b:a", "192k",
      tmpPath,
    ];

    // Prefer system ffmpeg; fall back to hyperframes' bundled binary which
    // ships as part of the npx tarball most users already have cached.
    const candidates: Array<{ cmd: string; args: string[] }> = [
      { cmd: "ffmpeg", args },
      {
        cmd: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["hyperframes", "ffmpeg", ...args],
      },
    ];

    let lastError = "no ffmpeg attempt succeeded";
    for (const candidate of candidates) {
      try {
        await new Promise<void>((resolveProc, rejectProc) => {
          const proc = spawn(candidate.cmd, candidate.args, {
            stdio: ["ignore", "pipe", "pipe"],
            shell: process.platform === "win32",
            windowsHide: true,
          });
          let stderrTail = "";
          proc.stderr.on("data", (chunk: Buffer) => {
            const text = chunk.toString("utf8");
            stderrTail = (stderrTail + text).slice(-1024);
          });
          proc.on("error", (err) => rejectProc(err));
          proc.on("exit", (code) => {
            if (code === 0) resolveProc();
            else
              rejectProc(
                new Error(`${candidate.cmd} exited ${code}\n${stderrTail.trim()}`)
              );
          });
        });
        // Atomic swap: replace the original with the transcoded version.
        await fs.rename(tmpPath, inputPath);
        return { ok: true as const, path: inputPath };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await fs.unlink(tmpPath).catch(() => undefined);
        // Try the next candidate.
      }
    }
    return { ok: false as const, error: lastError };
  });

  ipcMain.handle("fs:stat", async (_, path: string) => {
    try {
      const st = await fs.stat(path);
      return {
        exists: true,
        isFile: st.isFile(),
        size: st.size,
        mtimeMs: st.mtimeMs,
      };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      return {
        exists: false,
        isFile: false,
        size: 0,
        mtimeMs: 0,
        error: e.code ?? e.message ?? "stat failed",
      };
    }
  });

  ipcMain.handle("dialog:pick-folder", async (_, title?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title ?? "Pick a folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    "dialog:pick-file",
    async (_, args?: { title?: string; filters?: Electron.FileFilter[] }) => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: args?.title ?? "Pick a file",
        properties: ["openFile"],
        filters: args?.filters,
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    }
  );

  ipcMain.handle("shell:open-path", async (_, path: string) => {
    await shell.openPath(path);
  });

  ipcMain.handle("shell:reveal-in-folder", async (_, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle("shell:open-external", async (_, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("preview:start", async (_, workspacePath: string) => {
    const cfg = await loadConfig().catch(() => null);
    return agent.startPreview(workspacePath, cfg?.previewPort, cfg?.pythonBin);
  });

  ipcMain.handle("preview:stop", async () => {
    await agent.stopPreview();
  });

  ipcMain.handle("preview:state", async () => agent.getPreviewState());

  ipcMain.handle("sessions:list", async (_, projectId: string) => listSessions(projectId));

  ipcMain.handle("sessions:load", async (_, projectId: string, sessionId: string) =>
    loadSession(projectId, sessionId)
  );

  ipcMain.handle(
    "sessions:create",
    async (_, projectId: string, scaffold: SessionScaffold, title?: string) =>
      createSession(projectId, scaffold, title)
  );

  ipcMain.handle(
    "sessions:save",
    async (
      _,
      projectId: string,
      sessionId: string,
      events: AgentEvent[],
      scaffold: SessionScaffold
    ) => {
      await saveSession(projectId, sessionId, events, scaffold);
    }
  );

  ipcMain.handle(
    "sessions:rename",
    async (_, projectId: string, sessionId: string, title: string) => {
      await renameSession(projectId, sessionId, title);
    }
  );

  ipcMain.handle("sessions:delete", async (_, projectId: string, sessionId: string) => {
    await deleteSession(projectId, sessionId);
  });

  ipcMain.handle("meta:app-version", async () => app.getVersion());

  ipcMain.handle("meta:platform", async () => process.platform);

  ipcMain.handle("system:health", async () => runHealthChecks());
}
