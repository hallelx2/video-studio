import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";

/**
 * Native application menu — replaces Electron's default boilerplate menu so
 * the user gets a clean, on-brand chrome experience from the OS instead of
 * "Electron · File · Edit · View · Window · Help" with stock items they
 * never needed.
 *
 * Wires the zoom accelerators the user asked for (⌘+ / ⌘- / ⌘0) plus the
 * standard Edit/View/Window shortcuts that any desktop app should respect.
 *
 * On macOS, the first menu is always the app menu. On Windows/Linux, File
 * is the leading menu.
 */
export function buildAppMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === "darwin";

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      {
        label: "New Session",
        accelerator: isMac ? "Cmd+N" : "Ctrl+N",
        click: () => getWindow()?.webContents.send("menu:new-session"),
      },
      {
        label: "Search Sessions…",
        accelerator: isMac ? "Cmd+K" : "Ctrl+K",
        click: () => getWindow()?.webContents.send("menu:open-search"),
      },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };

  // The reason we're rebuilding the menu — the user wanted Ctrl+/Ctrl- to
  // zoom. These accelerators bind to webContents zoom roles so the renderer
  // scales without any extra IPC plumbing.
  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      {
        label: "Zoom In",
        accelerator: "CommandOrControl+Plus",
        click: () => zoomBy(getWindow(), +0.1),
      },
      {
        // Most keyboards report Ctrl+= when the user presses Ctrl+ (no shift),
        // so wire the same callback to the shifted form too.
        label: "Zoom In",
        accelerator: "CommandOrControl+=",
        click: () => zoomBy(getWindow(), +0.1),
        visible: false,
      },
      {
        label: "Zoom Out",
        accelerator: "CommandOrControl+-",
        click: () => zoomBy(getWindow(), -0.1),
      },
      {
        label: "Reset Zoom",
        accelerator: "CommandOrControl+0",
        click: () => setZoom(getWindow(), 0),
      },
      { type: "separator" },
      { role: "togglefullscreen" },
      { type: "separator" },
      // Dev-only — surfaces DevTools without forcing a separate keybinding.
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: isMac
      ? [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ]
      : [{ role: "minimize" }, { role: "close" }],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function zoomBy(win: BrowserWindow | null, delta: number): void {
  if (!win || win.isDestroyed()) return;
  const next = clamp(win.webContents.getZoomLevel() + delta * 10, -3, 6);
  win.webContents.setZoomLevel(next);
}

function setZoom(win: BrowserWindow | null, level: number): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.setZoomLevel(level);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
