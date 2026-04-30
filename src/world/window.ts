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

  getUpdateStatus: () =>
    ipcRenderer.invoke("update:status") as Promise<{
      progress: number | null;
      downloaded: boolean;
    }>,

  installUpdate: () => ipcRenderer.invoke("update:install"),

  // [VOICE-DEBUG-CAPTURE] Dev-only outgoing voice pipeline capture bridge.
  // pickDir prompts the user via dialog.showOpenDialog; writeBundle ships
  // four WAV ArrayBuffers + metadata via structured-clone IPC for fs.writeFile
  // in main. Only the renderer Settings UI invokes these — the IPC handlers
  // sanitise filenames to prevent traversal.
  debugCapture: {
    pickDir: () =>
      ipcRenderer.invoke("debug-capture:pickDir") as Promise<{
        canceled: boolean;
        path: string | null;
      }>,
    writeBundle: (payload: {
      parentDir: string;
      subfolderName: string;
      files: { name: string; buffer: ArrayBuffer }[];
      metadata: Record<string, unknown>;
    }) =>
      ipcRenderer.invoke("debug-capture:writeBundle", payload) as Promise<{
        path: string;
      }>,
  },
});