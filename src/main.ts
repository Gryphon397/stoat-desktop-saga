import { autoUpdater } from "electron-updater";

import { registerIpcHandlers } from "./native/window";

import { BrowserWindow, app, shell, ipcMain } from "electron";
import started from "electron-squirrel-startup";

import { autoLaunch } from "./native/autoLaunch";
import { config } from "./native/config";
import { initDiscordRpc } from "./native/discordRpc";
import { cleanupAppAudioCapture, initAppAudioCapture } from "./native/appAudioCapture";
import { cleanupPushToTalk, initPushToTalk } from "./native/pushToTalk";
import { initPopoutHandlers } from "./native/popout";
import { initDevToggle } from "./native/devToggle";
import { initScreenshareHandler } from "./native/screenshare";
import { initDebugCapture } from "./native/debugCapture";
import { initTray } from "./native/tray";
import { BUILD_URL, createMainWindow, initBuildUrl, mainWindow } from "./native/window";
import Store from "electron-store";

// For custom server storage and handling
type Settings = { serverUrl?: string };
const store = new Store<Settings>();

ipcMain.handle("server:get", () => store.get("serverUrl") ?? null);
// Saves the set server url
ipcMain.handle("server:set", (_event, url: string) => {
  const u = new URL(url);
  store.set("serverUrl", u.origin);
  return u.origin;
});
// Fetches the server origin
ipcMain.handle("server:getEffective", () => {
  const saved = store.get("serverUrl");
  return saved ?? null;
});

// Suppress Electron's native error when a screenshare request is cancelled
// without selecting a source (callback({}) throws on some Electron versions)
const isScreenshareCancelError = (e: unknown) =>
  e instanceof Error && (
    e.message.includes("no stream was provided") ||
    e.message.includes("Permission denied") ||
    e.message.includes("video was requested")
  );

process.on("uncaughtException", (error) => {
  if (isScreenshareCancelError(error)) return;
  throw error;
});

process.on("unhandledRejection", (reason) => {
  if (isScreenshareCancelError(reason)) return;
  throw reason;
});

// Squirrel-specific logic
// create/remove shortcuts on Windows when installing / uninstalling
// we just need to close out of the app immediately
if (started) {
  app.quit();
}

// disable hw-accel if so requested
if (!config.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// ensure only one copy of the application can run
const acquiredLock = app.requestSingleInstanceLock();

if (acquiredLock) {
  registerIpcHandlers();

  // IPC handler: renderer asks to install the downloaded update
  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Cached update state. webContents.send is fire-and-forget, so events that
  // fire before the renderer's onMount registers listeners (or that fire
  // against an old renderer before a dev-toggle reload) are dropped. The
  // renderer pulls this on mount to recover state regardless of timing.
  const updateState: { progress: number | null; downloaded: boolean } = {
    progress: null,
    downloaded: false,
  };

  ipcMain.handle("update:status", () => updateState);

  // Auto-update event forwarding to renderer
  if (app.isPackaged && process.platform === "win32") {
    // Update found — start showing the progress circle at 0%
    autoUpdater.on("update-available", () => {
      updateState.progress = 0;
      updateState.downloaded = false;
      mainWindow?.webContents.send("update:progress", 0);
    });

    // Send download progress percentage to renderer
    autoUpdater.on("download-progress", (progress) => {
      const pct = Math.round(progress.percent);
      updateState.progress = pct;
      mainWindow?.webContents.send("update:progress", pct);
    });

    // Download complete — switch to the install arrow.
    autoUpdater.on("update-downloaded", () => {
      updateState.downloaded = true;
      mainWindow?.webContents.send("update:downloaded");
    });
  }

  app.on("ready", () => {
    // initialise build URL from command line
    initBuildUrl();
    // create window and application contexts
    createMainWindow();


    // enable auto start on Windows and MacOS
    if (config.firstLaunch) {
      if (process.platform === "win32" || process.platform === "darwin") {
        autoLaunch.enable();
      }
      config.firstLaunch = false;
    }

    initTray();
    initDevToggle();
    initDiscordRpc();
    initPushToTalk();
    initScreenshareHandler();
    initAppAudioCapture();
    initPopoutHandlers();
    initDebugCapture();

    // Windows specific fix for notifications
    if (process.platform === "win32") {
      app.setAppUserModelId("chat.stoat.notifications");
    }

    // Check for updates on startup and then once per day
    if (app.isPackaged && process.platform === "win32") {
      autoUpdater.checkForUpdates();
      setInterval(() => autoUpdater.checkForUpdates(), 24 * 60 * 60 * 1000);
    }
  });

  // focus the window if we try to launch again
  app.on("second-instance", () => {
    mainWindow.show();
    mainWindow.restore();
    mainWindow.focus();
  });

  // macOS specific behaviour to keep app active in dock:
  // (irrespective of the minimise-to-tray option)

  app.on("window-all-closed", () => {
    cleanupAppAudioCapture();
    cleanupPushToTalk();
    if (process.platform !== "darwin") {
      // Only way I found was to SIGKILL the process since process.exit() and app.exit() didn't work
      process.kill(process.pid, "SIGKILL");
    }
  });

  // Clean up PTT on quit
  app.on("before-quit", () => {
    cleanupAppAudioCapture();
    cleanupPushToTalk();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ensure URLs launch in external context
  app.on("web-contents-created", (_, contents) => {
    // Allow navigation to Stoat/Revolt API and CDN domains
    const allowedOrigins = [
      "https://stoat.chat",
      "https://beta.revolt.chat",
      "https://revolt.chat",
      "https://api.revolt.chat",
      "https://cdn.stoatusercontent.com",
      "https://autumn.stoatusercontent.com",
      "https://cdn.revolt.chat",
    ];

    // prevent navigation out of build URL origin (but allow API/CDN)
    contents.on("will-navigate", (event, navigationUrl) => {
      const url = new URL(navigationUrl);

      // Allow stoat:// protocol (local electron-serve)
      if (url.protocol === "stoat:") {
        return;
      }

      // Allow same origin and dev variant
      if (url.origin === BUILD_URL.origin) {
        return;
      }
      // Allow the dev/prod counterpart origin (for dev toggle switching)
      const currentHost = new URL(mainWindow.webContents.getURL()).hostname;
      if (url.hostname === currentHost) {
        return;
      }

      // Allow known API/CDN origins
      if (allowedOrigins.some(origin => url.origin === origin || url.href.startsWith(origin))) {
        return;
      }

      // Block everything else
      console.log("[Window] Blocking navigation to:", navigationUrl);
      event.preventDefault();
    });

    // handle links externally
    contents.setWindowOpenHandler(({ url }) => {
      if (
        url.startsWith("http:") ||
        url.startsWith("https:") ||
        url.startsWith("mailto:")
      ) {
        setImmediate(() => {
          shell.openExternal(url);
        });
      }

      return { action: "deny" };
    });
  });
} else {
  app.quit();
}
