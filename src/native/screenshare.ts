import { desktopCapturer, ipcMain } from "electron";

import { mainWindow } from "./window";

export function initScreenshareHandler() {
  // Direct source list for the getUserMedia capture path (bypasses setDisplayMediaRequestHandler)
  ipcMain.handle("screenshare:getSources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  });

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
            if (!source) { callback({}); return; }

            const isScreen = sourceId.startsWith("screen:");
            const isWindow = sourceId.startsWith("window:");

            // Always provide loopback audio so LiveKit gets an audio track.
            // For window shares, the web client will replace the loopback
            // audio with per-process audio from appAudioCapture.
            if (isWindow) {
              mainWindow.webContents.send("screenshare:windowSelected", sourceId);
            }
            callback({ video: source, audio: "loopback" });
          };

          const onCancel = () => {
            if (resolved) return;
            resolved = true;
            ipcMain.removeListener("screenshare:select", onSelect);
            try {
              callback({});
            } catch {
              // Electron may throw natively when cancelling without a source
            }
          };

          ipcMain.once("screenshare:select", onSelect);
          ipcMain.once("screenshare:cancel", onCancel);
        })
        .catch(() => {
          try { callback({}); } catch { /* ignore */ }
        });
    },
    { useSystemPicker: false },
  );
}
