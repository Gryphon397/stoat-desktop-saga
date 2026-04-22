import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import { BUILD_URL, mainWindow } from "./window";

const popoutWindows = new Map<string, BrowserWindow>();

interface PopoutParams {
  identity: string;
  username: string;
  livekitUrl: string;
  viewerToken: string;
  volume?: number;
}

export function initPopoutHandlers() {
  ipcMain.handle("popout:open", (_event, params: PopoutParams) => {
    const existing = popoutWindows.get(params.identity);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    const query = new URLSearchParams({
      identity: params.identity,
      username: params.username,
      livekitUrl: params.livekitUrl,
      viewerToken: params.viewerToken,
      volume: String(params.volume ?? 1),
    }).toString();

    // Use the same origin the main window is actually loaded from, not
    // BUILD_URL which may differ (e.g. beta.revolt.chat fallback).
    const mainOrigin = new URL(mainWindow.webContents.getURL());
    let loadUrl: string;
    if (mainOrigin.protocol === "stoat:") {
      loadUrl = `stoat://-/popout?${query}`;
    } else {
      const base = new URL("/popout", mainOrigin.origin);
      base.search = query;
      loadUrl = base.toString();
    }

    console.log("[Popout] Loading URL:", loadUrl);

    const win = new BrowserWindow({
      width: 960,
      height: 540,
      minWidth: 320,
      minHeight: 180,
      title: `${params.username}'s Screen`,
      skipTaskbar: false,
      backgroundColor: "#000000",
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: mainOrigin.protocol === "https:",
      },
    });

    win.setMenu(null);
    win.loadURL(loadUrl);

    // Enable F12 DevTools in the popout window
    win.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" && !input.control && !input.shift && !input.alt) {
        event.preventDefault();
        win.webContents.toggleDevTools();
      }
    });

    win.on("closed", () => {
      popoutWindows.delete(params.identity);
      // Notify main window that this pop-out closed
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("popout:closed", params.identity);
      }
    });

    popoutWindows.set(params.identity, win);
  });

  ipcMain.handle("popout:close", (_event, identity: string) => {
    const win = popoutWindows.get(identity);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.handle("popout:mainDisconnected", () => {
    for (const [key, win] of popoutWindows) {
      if (!win.isDestroyed()) {
        win.close();
      }
      popoutWindows.delete(key);
    }
  });
}
