import { contextBridge, ipcRenderer } from "electron";

type DataCallback = (chunk: Uint8Array) => void;
type StopCallback = () => void;

const dataCallbacks = new Set<DataCallback>();
const stopCallbacks = new Set<StopCallback>();

ipcRenderer.on("app-audio:data", (_event, chunk: Buffer) => {
  const data = new Uint8Array(chunk);
  dataCallbacks.forEach((cb) => cb(data));
});

ipcRenderer.on("app-audio:stopped", () => {
  stopCallbacks.forEach((cb) => cb());
});

contextBridge.exposeInMainWorld("appAudioCapture", {
  start: (sourceId: string): Promise<boolean> =>
    ipcRenderer.invoke("app-audio:start", sourceId),

  stop: (): Promise<void> => ipcRenderer.invoke("app-audio:stop"),

  onData: (callback: DataCallback) => {
    dataCallbacks.add(callback);
  },

  offData: (callback: DataCallback) => {
    dataCallbacks.delete(callback);
  },

  onStopped: (callback: StopCallback) => {
    stopCallbacks.add(callback);
  },

  offStopped: (callback: StopCallback) => {
    stopCallbacks.delete(callback);
  },
});
