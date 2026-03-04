import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import { BUILD_URL, mainWindow } from "./window";

const popoutWindows = new Map<string, BrowserWindow>();

interface PopoutParams {
  url: string;
  token: string;
  identity: string;
  trackSource: string;
  username: string;
}

export function initPopoutHandlers() {
  ipcMain.handle("popout:open", (_event, params: PopoutParams) => {
    const existing = popoutWindows.get(params.identity);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    const query = new URLSearchParams({
      url: params.url,
      token: params.token,
      identity: params.identity,
      trackSource: params.trackSource,
      username: params.username,
    }).toString();

    let loadUrl: string;
    if (BUILD_URL.protocol === "stoat:") {
      loadUrl = `stoat://-/popout?${query}`;
    } else {
      const base = new URL("/popout", BUILD_URL);
      base.search = query;
      loadUrl = base.toString();
    }

    const win = new BrowserWindow({
      width: 854,
      height: 480,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: "#000000",
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: BUILD_URL.protocol === "https:",
      },
    });

    win.setMenu(null);
    win.loadURL(loadUrl);

    win.on("closed", () => {
      popoutWindows.delete(params.identity);
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
