import { app, dialog, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * GitHub-backed auto-update wiring.
 *
 * On startup (production builds only) we ask GitHub if a newer release is
 * available, download it in the background, and prompt the user to restart
 * once it's been written to disk. Re-checks every hour so a long-running
 * session eventually picks up new releases.
 *
 * Linux note: AppImage updates are handled by electron-updater natively as
 * long as the app was launched via the AppImage (it replaces itself on
 * relaunch). For .deb/.rpm packages auto-update is not supported by
 * electron-updater — those distros expect package-manager updates instead.
 *
 * macOS note: requires the .dmg to be code-signed and notarized. Without a
 * Developer ID cert the updater will refuse to swap the bundle. We log
 * the error and stay on the current version.
 *
 * Windows note: NSIS installers can self-update without a signing cert,
 * but Windows SmartScreen warns on every install. A signed cert removes
 * the warning.
 */
export function initAutoUpdate(getMainWindow: () => BrowserWindow | null): void {
  // Skip in dev — there's no installed app to swap.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  // Don't surprise the user with a forced restart — wait for them to quit
  // normally, then apply the pending update on next launch. The
  // "update-downloaded" handler below offers an explicit restart prompt
  // so they can opt in immediately if they want.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.warn("[auto-update] error:", err?.message ?? err);
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[auto-update] update available:", info?.version);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[auto-update] up to date");
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const win = getMainWindow();
    if (!win) return;
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Video Studio ${info.version} is ready to install.`,
      detail: "Restart now to apply the update, or it will install automatically the next time you quit.",
    });
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  // First check — small delay so the renderer is mounted and the user
  // isn't greeted by a network call competing with first-paint.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => undefined);
  }, 5_000);

  // Periodic re-check — keeps long sessions current.
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => undefined);
    },
    60 * 60 * 1000 // hourly
  );
}
