import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join } from "node:path";
import { AgentBridge } from "./agent-bridge.js";
import { loadConfig, saveConfig } from "./config.js";
import { listProjects } from "./projects.js";
import type { AppConfig, GenerateRequest } from "./types.js";

// __dirname is provided by CommonJS — no fileURLToPath needed.

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const agent = new AgentBridge();
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false, // wait for ready-to-show, avoids flash of white
    backgroundColor: "#0A0A0B", // ink — matches DESIGN.md so first paint isn't a white flash
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
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // electron/dist/main.js → ../.. → project root → dist/renderer/index.html
    mainWindow.loadFile(join(__dirname, "..", "..", "dist", "renderer", "index.html"));
  }
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
app.whenReady().then(() => {
  registerIpcHandlers();
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
});

// ─── IPC handlers ──────────────────────────────────────────────────────────
function registerIpcHandlers(): void {
  ipcMain.handle("config:get", async () => loadConfig());

  ipcMain.handle("config:save", async (_, config: AppConfig) => saveConfig(config));

  ipcMain.handle("projects:list", async () => {
    const config = await loadConfig();
    if (!config.orgProjectsPath) return [];
    return listProjects(config.orgProjectsPath);
  });

  ipcMain.handle("agent:generate", async (_, req: GenerateRequest) => {
    const config = await loadConfig();
    await agent.generate(req, config);
  });

  ipcMain.handle("agent:respond", async (_, promptId: string, response: string) => {
    await agent.respond(promptId, response);
  });

  ipcMain.handle("agent:cancel", async () => agent.cancel());

  ipcMain.handle("agent:is-running", async () => agent.isRunning());

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

  ipcMain.handle("meta:app-version", async () => app.getVersion());

  ipcMain.handle("meta:platform", async () => process.platform);
}
