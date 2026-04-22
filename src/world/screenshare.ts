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
  onWindowSelected: (callback: (sourceId: string) => void) => {
    ipcRenderer.on("screenshare:windowSelected", (_event, sourceId: string) => {
      callback(sourceId);
    });
  },
  listSources: (): Promise<ScreenShareSource[]> => {
    return ipcRenderer.invoke("screenshare:getSources");
  },
});
