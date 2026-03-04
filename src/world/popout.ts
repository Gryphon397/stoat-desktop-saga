import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("stoatPopout", {
  open: (params: {
    url: string;
    token: string;
    identity: string;
    trackSource: string;
    username: string;
  }) => ipcRenderer.invoke("popout:open", params),
  close: (identity: string) => ipcRenderer.invoke("popout:close", identity),
  notifyMainDisconnected: () =>
    ipcRenderer.invoke("popout:mainDisconnected"),
});
