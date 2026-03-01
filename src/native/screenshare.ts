import { desktopCapturer, ipcMain } from "electron";

import { mainWindow } from "./window";

export function initScreenshareHandler() {
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 320, height: 180 },
        })
        .then((sources) => {
          const serialized = sources.map((s) => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL(),
          }));

          mainWindow.webContents.send("screenshare:sources", serialized);

          let resolved = false;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const onSelect = (_: any, sourceId: string) => {
            if (resolved) return;
            resolved = true;
            ipcMain.removeListener("screenshare:cancel", onCancel);
            const source = sources.find((s) => s.id === sourceId);
            callback(source ? { video: source } : {});
          };

          const onCancel = () => {
            if (resolved) return;
            resolved = true;
            ipcMain.removeListener("screenshare:select", onSelect);
            callback({});
          };

          ipcMain.once("screenshare:select", onSelect);
          ipcMain.once("screenshare:cancel", onCancel);
        })
        .catch(() => {
          callback({});
        });
    },
  );
}
