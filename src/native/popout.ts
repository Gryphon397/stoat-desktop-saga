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
    console.log("[Popout] get-offer for", identity, offer ? "found" : "NOT FOUND");
    return offer ?? null;
  });

  // Pop-out sends its WebRTC answer back to the main window
  ipcMain.handle(
    "popout:send-answer",
    (_event, identity: string, answerSdp: string) => {
      console.log("[Popout] Relaying answer for", identity);
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
