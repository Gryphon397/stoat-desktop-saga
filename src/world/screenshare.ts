import { contextBridge, ipcRenderer } from "electron";

export interface ScreenShareSource {
  id: string;
  name: string;
  thumbnail: string;
}

contextBridge.exposeInMainWorld("desktopCapture", {
  onSourcesAvailable: (callback: (sources: ScreenShareSource[]) => void) => {
    ipcRenderer.on(
      "screenshare:sources",
      (_event, sources: ScreenShareSource[]) => {
        callback(sources);
      },
    );
  },
  selectSource: (id: string) => {
    ipcRenderer.send("screenshare:select", id);
  },
  cancel: () => {
    ipcRenderer.send("screenshare:cancel");
  },
});
