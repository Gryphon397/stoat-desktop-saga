import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("stoatPopout", {
  open: (params: {
    identity: string;
    username: string;
    offerSdp: string;
  }) => ipcRenderer.invoke("popout:open", params),
  close: (identity: string) => ipcRenderer.invoke("popout:close", identity),
  notifyMainDisconnected: () =>
    ipcRenderer.invoke("popout:mainDisconnected"),

  // WebRTC signaling — used by pop-out window
  getOffer: (identity: string) =>
    ipcRenderer.invoke("popout:get-offer", identity),
  sendAnswer: (identity: string, answerSdp: string) =>
    ipcRenderer.invoke("popout:send-answer", identity, answerSdp),

  // WebRTC signaling — used by main window to receive answer
  onAnswer: (
    callback: (identity: string, answerSdp: string) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      identity: string,
      answerSdp: string,
    ) => {
      callback(identity, answerSdp);
    };
    ipcRenderer.on("popout:answer", handler);
    return () => ipcRenderer.removeListener("popout:answer", handler);
  },

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
