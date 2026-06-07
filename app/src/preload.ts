import { contextBridge, ipcRenderer } from "electron";

function invoke<T>(channel: string, ...args: unknown[]) {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

contextBridge.exposeInMainWorld("bookshop", {
  getStartupState: () => invoke("get-startup-state"),
  canPersistSession: () => invoke<boolean>("can-persist-session"),
  loadLibrary: () => invoke("load-library"),
  login: (email: string, password: string) =>
    invoke("login", email, password),
  logout: () => invoke("logout"),
  getAccount: () => invoke("get-account"),
  reregisterDevice: () => invoke("reregister-device"),
  listLibrary: () => invoke("list-library"),
  downloadBook: (checksum: string) => invoke("download-book", checksum),
  showInFolder: (filePath: string) => invoke("show-in-folder", filePath),
  onDownloadProgress: (
    callback: (data: { checksum: string; message: string }) => void,
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, data: {
      checksum: string;
      message: string;
    }) => callback(data);
    ipcRenderer.on("download-progress", listener);
    return () => ipcRenderer.removeListener("download-progress", listener);
  },
});
