import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canPersistSession,
  clearSession,
  hasSavedSession,
  initSessionStorage,
  loadSession,
  saveSession,
} from "./session.js";

initSessionStorage();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEVICE_FILE = join(homedir(), ".bookshop", "device-registration.json");

type BookshopClient = import("bookshop-lib/client.js").BookshopClient;
type DigitalBook = import("bookshop-lib/client.js").DigitalBook;

export interface StartupState {
  authed: boolean;
  email?: string;
  deviceName?: string;
  books?: ReturnType<typeof mapBooks>;
  sessionPersisted: boolean;
}

let client: BookshopClient | null = null;
let books: DigitalBook[] = [];
let accountEmail: string | null = null;
let startupState: StartupState = {
  authed: false,
  sessionPersisted: canPersistSession(),
};

async function loadLib() {
  const [auth, clientMod, downloadMod, epubMod] = await Promise.all([
    import("bookshop-lib/auth.js"),
    import("bookshop-lib/client.js"),
    import("bookshop-lib/download.js"),
    import("bookshop-lib/epub.js"),
  ]);
  return { ...auth, ...clientMod, ...downloadMod, ...epubMod };
}

function appIconPath() {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(__dirname, "..", "build", "icon.png");
}

function mapBooks(
  library: DigitalBook[],
  bookTitle: (book: DigitalBook) => string,
) {
  return library.map((book) => ({
    checksum: book.checksum,
    sku: book.sku,
    title: bookTitle(book),
    type: book.product?.is_drm_free ? "drm-free" : "lcp",
  }));
}

async function peekDeviceName() {
  try {
    const stored = JSON.parse(await readFile(DEVICE_FILE, "utf8")) as {
      device_name?: string;
    };
    return stored.device_name ?? "Not registered";
  } catch {
    return "Not registered";
  }
}

async function deviceNameForClient(activeClient: BookshopClient) {
  const device =
    (await activeClient.peekDevice()) ?? (await activeClient.getDevice());
  return device.device_name;
}

async function loadLibraryForClient(activeClient: BookshopClient) {
  const { bookTitle } = await import("bookshop-lib/download.js");
  books = await activeClient.listLibrary();
  return {
    books: mapBooks(books, bookTitle),
    deviceName: await deviceNameForClient(activeClient),
  };
}

async function ensureClient() {
  if (!client) {
    const { BookshopClient } = await import("bookshop-lib/client.js");
    client = new BookshopClient();
    client.resetToken();
  }
  return client;
}

function isAuthError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /\(401\)|sign-in failed:/i.test(message);
}

async function signOut() {
  const { clearCredentials } = await import("bookshop-lib/auth.js");
  clearCredentials();
  client = null;
  books = [];
  accountEmail = null;
}

async function restoreSessionLocal() {
  const session = await loadSession();
  if (!session) return null;

  const { setCredentials } = await import("bookshop-lib/auth.js");
  setCredentials(session);
  accountEmail = session.email;

  return {
    email: session.email,
    deviceName: await peekDeviceName(),
    books: [],
    sessionPersisted: canPersistSession(),
  };
}

async function prepareStartupState(): Promise<StartupState> {
  const sessionPersisted = canPersistSession();
  if (!hasSavedSession()) {
    return { authed: false, sessionPersisted };
  }

  try {
    const session = await restoreSessionLocal();
    if (!session) {
      await clearSession();
      await signOut();
      return { authed: false, sessionPersisted };
    }

    return { authed: true, ...session, sessionPersisted };
  } catch {
    await clearSession();
    await signOut();
    return { authed: false, sessionPersisted };
  }
}

async function signIn(email: string, password: string) {
  const lib = await loadLib();
  lib.setCredentials({ email, password });
  client = new lib.BookshopClient();
  client.resetToken();
  accountEmail = email;
  await saveSession(email, password);

  const library = await loadLibraryForClient(client);
  return {
    email,
    deviceName: library.deviceName,
    books: library.books,
    sessionPersisted: canPersistSession(),
  };
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

function registerIpcHandlers() {
  ipcMain.handle("get-startup-state", () => startupState);

  ipcMain.handle("can-persist-session", () => canPersistSession());

  ipcMain.handle("load-library", async () => {
    if (!accountEmail) throw new Error("Not signed in");
    try {
      const activeClient = await ensureClient();
      return await loadLibraryForClient(activeClient);
    } catch (err) {
      if (isAuthError(err)) {
        await clearSession();
        await signOut();
      }
      throw err;
    }
  });

  ipcMain.handle("login", async (_event, email: string, password: string) => {
    return signIn(email, password);
  });

  ipcMain.handle("logout", async () => {
    await clearSession();
    await signOut();
  });

  ipcMain.handle("get-account", async () => {
    if (!client || !accountEmail) return null;
    return {
      email: accountEmail,
      deviceName: await deviceNameForClient(client),
      sessionPersisted: canPersistSession(),
    };
  });

  ipcMain.handle("reregister-device", async () => {
    if (!client) throw new Error("Not signed in");
    const device = await client.reregisterDevice();
    return device.device_name;
  });

  ipcMain.handle("list-library", async () => {
    const activeClient = await ensureClient();
    const { bookTitle } = await import("bookshop-lib/download.js");
    books = await activeClient.listLibrary();
    return mapBooks(books, bookTitle);
  });

  ipcMain.handle("download-book", async (event, checksum: string) => {
    const activeClient = await ensureClient();
    const { bookTitle, downloadBook } = await import("bookshop-lib/download.js");
    const { safeName } = await import("bookshop-lib/epub.js");

    const book = books.find((entry) => entry.checksum === checksum);
    if (!book) throw new Error("Book not found");

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save EPUB",
      defaultPath: `${safeName(bookTitle(book))}.epub`,
      filters: [{ name: "EPUB", extensions: ["epub"] }],
    });
    if (canceled || !filePath) return null;

    return downloadBook(activeClient, book, {
      outPath: filePath,
      onProgress: (message) => {
        event.sender.send("download-progress", { checksum, message });
      },
    });
  });

  ipcMain.handle("show-in-folder", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}

registerIpcHandlers();

app.whenReady().then(async () => {
  startupState = await prepareStartupState();

  if (process.platform === "darwin" && app.dock) {
    const icon = appIconPath();
    if (existsSync(icon)) app.dock.setIcon(icon);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
