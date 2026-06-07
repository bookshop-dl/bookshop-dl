import { createApp } from "./petite-vue.es.js";

createApp({
  signedIn: false,
  bridgeError: !window.bookshop,
  email: "",
  password: "",
  loginError: "",
  loggingIn: false,
  refreshing: false,
  books: [],
  downloads: {},

  get bookCountLabel() {
    const n = this.books.length;
    return `${n} ${n === 1 ? "book" : "books"}`;
  },

  mounted() {
    if (!window.bookshop) return;
    window.bookshop.onDownloadProgress(({ checksum, message }) => {
      const current = this.downloads[checksum] ?? {};
      this.downloads[checksum] = { ...current, status: message };
    });
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
      this.books = await window.bookshop.login(
        this.email.trim(),
        this.password,
      );
      this.signedIn = true;
    } catch (err) {
      this.loginError =
        err instanceof Error ? err.message : "Sign-in failed";
    } finally {
      this.loggingIn = false;
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
