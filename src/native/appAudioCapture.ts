import * as path from "node:path";

import { app, ipcMain } from "electron";

import { mainWindow } from "./window";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loopback: any = null;
let activePid: string | null = null;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
function log(...args: unknown[]) {
  if (isDev) console.log("[AppAudio]", ...args);
}

function loadLoopback() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loopback = require("application-loopback");
  } catch {
    const unpackedPath = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "application-loopback",
      "dist",
      "index.js",
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loopback = require(unpackedPath);
  }

  // Point at the correct bin directory (unpacked from asar)
  if (app.isPackaged) {
    const binRoot = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "application-loopback",
      "bin",
    );
    loopback.setExecutablesRoot(binRoot);
    log("Set executables root:", binRoot);
  }
}

async function resolveProcessId(sourceId: string): Promise<string | null> {
  if (!loopback) loadLoopback();
  if (!loopback) return null;

  // sourceId format: "window:HWND:0"
  const hwnd = sourceId.split(":")[1];
  if (!hwnd) return null;

  try {
    const windows = await loopback.getActiveWindowProcessIds();
    const match = windows.find(
      (w: { hwnd: string }) => w.hwnd === hwnd,
    );
    if (match) {
      log("Resolved HWND", hwnd, "->", match.processId, match.title);
      return match.processId;
    }
    log("No window found for HWND:", hwnd);
    return null;
  } catch (e) {
    log("Failed to resolve PID:", e);
    return null;
  }
}

async function startCapture(sourceId: string): Promise<boolean> {
  if (activePid) {
    log("Stopping previous capture before starting new one");
    stopCapture();
  }

  const pid = await resolveProcessId(sourceId);
  if (!pid) return false;

  try {
    loopback.startAudioCapture(pid, {
      onData: (chunk: Uint8Array) => {
        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          !mainWindow.webContents.isDestroyed()
        ) {
          mainWindow.webContents.send("app-audio:data", Buffer.from(chunk));
        }
      },
    });
    activePid = pid;
    log("Started capture for PID:", pid);
    return true;
  } catch (e) {
    log("Failed to start capture:", e);
    return false;
  }
}

function stopCapture() {
  if (activePid && loopback) {
    try {
      loopback.stopAudioCapture(activePid);
      log("Stopped capture for PID:", activePid);
    } catch (e) {
      log("Error stopping capture:", e);
    }
    activePid = null;
  }
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send("app-audio:stopped");
  }
}

export function initAppAudioCapture() {
  log("Initializing per-process audio capture");

  ipcMain.handle("app-audio:start", (_, sourceId: string) =>
    startCapture(sourceId),
  );
  ipcMain.handle("app-audio:stop", () => {
    stopCapture();
  });
}

export function cleanupAppAudioCapture() {
  stopCapture();
}
