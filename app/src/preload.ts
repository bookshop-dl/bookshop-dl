import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bookshop", {
  login: (email: string, password: string) =>
    ipcRenderer.invoke("login", email, password),
  listLibrary: () => ipcRenderer.invoke("list-library"),
  downloadBook: (checksum: string) =>
    ipcRenderer.invoke("download-book", checksum),
  showInFolder: (filePath: string) =>
    ipcRenderer.invoke("show-in-folder", filePath),
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
