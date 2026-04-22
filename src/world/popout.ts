import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("stoatPopout", {
  open: (params: {
    identity: string;
    username: string;
    livekitUrl: string;
    viewerToken: string;
    volume?: number;
  }) => ipcRenderer.invoke("popout:open", params),
  close: (identity: string) => ipcRenderer.invoke("popout:close", identity),
  notifyMainDisconnected: () =>
    ipcRenderer.invoke("popout:mainDisconnected"),

  // Notification when a pop-out window is closed by the user
  onPopoutClosed: (
    callback: (identity: string) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      identity: string,
    ) => {
      callback(identity);
    };
    ipcRenderer.on("popout:closed", handler);
    return () => ipcRenderer.removeListener("popout:closed", handler);
  },
});
