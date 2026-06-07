import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { setCredentials } from "bookshop-lib/auth.js";
import { BookshopClient, type DigitalBook } from "bookshop-lib/client.js";
import { bookTitle, downloadBook } from "bookshop-lib/download.js";
import { safeName } from "bookshop-lib/epub.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let client: BookshopClient | null = null;
let books: DigitalBook[] = [];

function appIconPath() {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(__dirname, "..", "build", "icon.png");
}

function createWindow() {
  const icon = appIconPath();
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    title: "bookshop-dl",
    ...(existsSync(icon) ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    const icon = appIconPath();
    if (existsSync(icon)) app.dock.setIcon(icon);
  }
  ipcMain.handle("login", async (_event, email: string, password: string) => {
    setCredentials({ email, password });
    client = new BookshopClient();
    client.resetToken();
    books = await client.listLibrary();
    return books.map((book) => ({
      checksum: book.checksum,
      sku: book.sku,
      title: bookTitle(book),
      type: book.product?.is_drm_free ? "drm-free" : "lcp",
    }));
  });

  ipcMain.handle("list-library", async () => {
    if (!client) throw new Error("Not signed in");
    books = await client.listLibrary();
    return books.map((book) => ({
      checksum: book.checksum,
      sku: book.sku,
      title: bookTitle(book),
      type: book.product?.is_drm_free ? "drm-free" : "lcp",
    }));
  });

  ipcMain.handle("download-book", async (event, checksum: string) => {
    if (!client) throw new Error("Not signed in");

    const book = books.find((entry) => entry.checksum === checksum);
    if (!book) throw new Error("Book not found");

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save EPUB",
      defaultPath: `${safeName(bookTitle(book))}.epub`,
      filters: [{ name: "EPUB", extensions: ["epub"] }],
    });
    if (canceled || !filePath) return null;

    const savedPath = await downloadBook(client, book, {
      outPath: filePath,
      onProgress: (message) => {
        event.sender.send("download-progress", { checksum, message });
      },
    });

    return savedPath;
  });

  ipcMain.handle("show-in-folder", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
