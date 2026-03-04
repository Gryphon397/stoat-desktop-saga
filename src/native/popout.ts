import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import { BUILD_URL, mainWindow } from "./window";

const popoutWindows = new Map<string, BrowserWindow>();
const pendingOffers = new Map<string, string>();

interface PopoutParams {
  identity: string;
  username: string;
  offerSdp: string;
}

export function initPopoutHandlers() {
  ipcMain.handle("popout:open", (_event, params: PopoutParams) => {
    const existing = popoutWindows.get(params.identity);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    // Store the WebRTC offer for the pop-out to retrieve
    pendingOffers.set(params.identity, params.offerSdp);

    const query = new URLSearchParams({
      identity: params.identity,
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
        webSecurity: BUILD_URL.protocol === "https:",
      },
    });

    win.setMenu(null);
    win.loadURL(loadUrl);

    win.on("closed", () => {
      popoutWindows.delete(params.identity);
      pendingOffers.delete(params.identity);
      // Notify main window that this pop-out closed
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("popout:closed", params.identity);
      }
    });

    popoutWindows.set(params.identity, win);
  });

  // Pop-out requests the WebRTC offer
  ipcMain.handle("popout:get-offer", (_event, identity: string) => {
    const offer = pendingOffers.get(identity);
    pendingOffers.delete(identity);
    return offer ?? null;
  });

  // Pop-out sends its WebRTC answer back to the main window
  ipcMain.handle(
    "popout:send-answer",
    (_event, identity: string, answerSdp: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("popout:answer", identity, answerSdp);
      }
    },
  );

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
    pendingOffers.clear();
  });
}
