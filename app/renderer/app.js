import { createApp } from "./petite-vue.es.js";

function isAuthError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /\(401\)|sign-in failed:/i.test(message);
}

function ipcTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

createApp({
  signedIn: false,
  restoring: true,
  libraryLoading: false,
  bridgeError: !window.bookshop,
  email: "",
  password: "",
  accountEmail: "",
  deviceName: "",
  sessionPersisted: true,
  loginError: "",
  accountError: "",
  loggingIn: false,
  refreshing: false,
  reregistering: false,
  books: [],
  downloads: {},

  get bookCountLabel() {
    if (this.libraryLoading) return "Loading library...";
    const n = this.books.length;
    return `${n} ${n === 1 ? "book" : "books"}`;
  },

  async bootstrap() {
    if (!window.bookshop) {
      this.restoring = false;
      return;
    }

    const safety = setTimeout(() => {
      this.restoring = false;
      if (!this.signedIn) {
        this.loginError = "Startup timed out. Please try again.";
      }
    }, 8000);

    try {
      window.bookshop.onDownloadProgress(({ checksum, message }) => {
        const current = this.downloads[checksum] ?? {};
        this.downloads[checksum] = { ...current, status: message };
      });

      const state = await ipcTimeout(
        window.bookshop.getStartupState(),
        5000,
        { authed: false, sessionPersisted: true },
      );
      this.sessionPersisted = state.sessionPersisted ?? true;

      if (state.authed && state.email) {
        this.applySession({
          email: state.email,
          deviceName: state.deviceName ?? "Not registered",
          books: state.books ?? [],
          sessionPersisted: state.sessionPersisted,
        });
        this.restoring = false;
        void this.loadLibraryInBackground();
        return;
      }
    } catch (err) {
      this.loginError =
        err instanceof Error ? err.message : "Could not restore session";
    } finally {
      clearTimeout(safety);
      this.restoring = false;
    }
  },

  applySession(session) {
    this.signedIn = true;
    this.accountEmail = session.email;
    this.deviceName = session.deviceName;
    this.sessionPersisted = session.sessionPersisted ?? true;
    this.books = session.books ?? [];
    this.loginError = "";
    this.accountError = "";
  },

  async loadLibraryInBackground() {
    this.libraryLoading = true;
    this.accountError = "";
    try {
      const library = await window.bookshop.loadLibrary();
      this.books = library.books;
      if (library.deviceName) this.deviceName = library.deviceName;
    } catch (err) {
      if (isAuthError(err)) {
        this.signedIn = false;
        this.accountEmail = "";
        this.deviceName = "";
        this.books = [];
        this.loginError =
          err instanceof Error
            ? err.message
            : "Saved sign-in expired. Please sign in again.";
      } else {
        this.accountError =
          err instanceof Error
            ? err.message
            : "Could not load your library. Try Refresh.";
      }
    } finally {
      this.libraryLoading = false;
    }
  },

  statusText(book) {
    const state = this.downloads[book.checksum];
    if (!state) return "";
    if (state.savedPath) return "Downloaded";
    return state.status ?? "";
  },

  hasSavedPath(book) {
    return Boolean(this.downloads[book.checksum]?.savedPath);
  },

  savedPath(book) {
    return this.downloads[book.checksum]?.savedPath ?? "";
  },

  isDownloading(book) {
    return Boolean(this.downloads[book.checksum]?.downloading);
  },

  async login() {
    this.loginError = "";
    this.loggingIn = true;
    try {
      this.applySession(
        await window.bookshop.login(this.email.trim(), this.password),
      );
      this.password = "";
    } catch (err) {
      this.loginError =
        err instanceof Error ? err.message : "Sign-in failed";
    } finally {
      this.loggingIn = false;
    }
  },

  async logout() {
    this.accountError = "";
    await window.bookshop.logout();
    this.signedIn = false;
    this.accountEmail = "";
    this.deviceName = "";
    this.books = [];
    this.downloads = {};
    this.password = "";
    this.libraryLoading = false;
  },

  async reregisterDevice() {
    if (
      !confirm(
        "Register a new device with Bookshop? This uses one of your device slots and may remove your oldest device if you're at the limit.",
      )
    ) {
      return;
    }

    this.accountError = "";
    this.reregistering = true;
    try {
      this.deviceName = await window.bookshop.reregisterDevice();
    } catch (err) {
      this.accountError =
        err instanceof Error ? err.message : "Could not re-register device";
    } finally {
      this.reregistering = false;
    }
  },

  async refresh() {
    this.refreshing = true;
    try {
      this.books = await window.bookshop.listLibrary();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      this.refreshing = false;
    }
  },

  async download(book) {
    const key = book.checksum;
    this.downloads[key] = {
      ...(this.downloads[key] ?? {}),
      downloading: true,
      status: "Starting...",
    };

    try {
      const path = await window.bookshop.downloadBook(key);
      if (path) {
        this.downloads[key] = {
          savedPath: path,
          status: "Done",
          downloading: false,
        };
      } else {
        delete this.downloads[key];
      }
    } catch (err) {
      this.downloads[key] = {
        status: err instanceof Error ? err.message : "Download failed",
        downloading: false,
      };
    }
  },

  showInFolder(filePath) {
    window.bookshop.showInFolder(filePath);
  },
}).mount();
