import { ipcMain } from "electron";
import { mainWindow } from "./window";

/**
 * Derive the dev URL from a prod URL by appending "dev" to the first subdomain.
 * e.g. stoat.sagarmatha.app -> stoatdev.sagarmatha.app
 */
function toDevUrl(url: string): string {
  const u = new URL(url);
  const parts = u.hostname.split(".");
  parts[0] = parts[0] + "dev";
  u.hostname = parts.join(".");
  return u.toString();
}

/**
 * Derive the prod URL from a dev URL by stripping "dev" from the first subdomain.
 * e.g. stoatdev.sagarmatha.app -> stoat.sagarmatha.app
 */
function toProdUrl(url: string): string {
  const u = new URL(url);
  const parts = u.hostname.split(".");
  if (parts[0].endsWith("dev")) {
    parts[0] = parts[0].slice(0, -3);
  }
  u.hostname = parts.join(".");
  return u.toString();
}

function isDev(url: string): boolean {
  try {
    return new URL(url).hostname.split(".")[0].endsWith("dev");
  } catch {
    return false;
  }
}

export function initDevToggle() {
  ipcMain.handle("devtoggle:switch", () => {
    if (!mainWindow) return;
    const current = mainWindow.webContents.getURL();
    const target = isDev(current) ? toProdUrl(current) : toDevUrl(current);
    mainWindow.loadURL(target);
    return isDev(target);
  });

  ipcMain.handle("devtoggle:status", () => {
    if (!mainWindow) return false;
    return isDev(mainWindow.webContents.getURL());
  });
}
