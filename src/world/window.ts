import { contextBridge, ipcRenderer } from "electron";
import { version } from "../../package.json";

contextBridge.exposeInMainWorld("native", {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    desktop: () => version,
  },

  minimise: () => ipcRenderer.send("minimise"),
  maximise: () => ipcRenderer.send("maximise"),
  close: () => ipcRenderer.send("close"),

  onMaximiseChanged: (callback: (isMaximised: boolean) => void) => {
    ipcRenderer.on("maximise-changed", (_event, isMaximised: boolean) =>
      callback(isMaximised),
    );
  },

  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on("update:progress", (_event, percent: number) => callback(percent));
  },

  onUpdateAvailable: (callback: () => void) => {
    ipcRenderer.on("update:downloaded", () => callback());
  },

  installUpdate: () => ipcRenderer.invoke("update:install"),
});