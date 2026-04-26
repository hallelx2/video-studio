import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } from "electron";
import { join, dirname } from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
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
// inside the app instead of handing them off to the OS player. We register
// the scheme as privileged so it supports HTTP-style range requests
// (Chromium asks for byte ranges to seek through video).
//
// URLs look like `studio-media:///<urlencoded-absolute-path>` so the path
// survives untouched through URL parsing — Windows drive letters and
// backslashes don't need special-case handling here.
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

function registerMediaProtocol(): void {
  protocol.handle("studio-media", async (request) => {
    try {
      const url = new URL(request.url);
      // Strip the leading "/" so decodeURIComponent gets just the path.
      const decoded = decodeURIComponent(url.pathname.replace(/^\//, ""));
      // Defensive: the renderer only ever asks for files under the user's
      // workspace or projects folder — nothing else should be reachable
      // through this scheme. We don't enforce that here yet (the workspace
      // path isn't readily available to this handler), but the renderer
      // never constructs URLs to anything outside it, and the scheme is
      // only mounted in our own BrowserWindow.
      return await net.fetch(pathToFileURL(decoded).toString());
    } catch (err) {
      return new Response(`media error: ${(err as Error).message}`, {
        status: 500,
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

  ipcMain.handle("dialog:pick-folder", async (_, title?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title ?? "Pick a folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

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
    return agent.startPreview(workspacePath, cfg?.previewPort);
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
