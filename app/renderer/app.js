const loginView = document.getElementById("login-view");
const libraryView = document.getElementById("library-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");
const refreshBtn = document.getElementById("refresh-btn");
const bookList = document.getElementById("book-list");
const bookCount = document.getElementById("book-count");

/** @type {Map<string, { status?: string, savedPath?: string }>} */
const downloadState = new Map();

/** @type {Array<{checksum:string,sku:string,title:string,type:string}>} */
let currentBooks = [];

if (!window.bookshop) {
  loginError.hidden = false;
  loginError.textContent =
    "App bridge failed to load. Try rebuilding with npm run app.";
} else {
  window.bookshop.onDownloadProgress(({ checksum, message }) => {
    const state = downloadState.get(checksum) ?? {};
    state.status = message;
    downloadState.set(checksum, state);
    renderBooks(currentBooks);
  });
}

function showLibrary() {
  loginView.hidden = true;
  libraryView.hidden = false;
}

function renderBooks(books) {
  currentBooks = books;
  bookCount.textContent = `${books.length} ${books.length === 1 ? "book" : "books"}`;
  bookList.innerHTML = "";

  if (books.length === 0) {
    bookList.innerHTML = "<p class='subtitle'>No ebooks in your library.</p>";
    return;
  }

  for (const book of books) {
    const state = downloadState.get(book.checksum) ?? {};
    const card = document.createElement("article");
    card.className = "book-card";

    const statusClass = state.savedPath ? "status success" : "status";
    const statusText =
      state.savedPath ? "Downloaded" : (state.status ?? "");

    card.innerHTML = `
      <div class="book-meta">
        <h2>${escapeHtml(book.title)}</h2>
        <p>
          <span class="badge">${escapeHtml(book.type)}</span>
          SKU ${escapeHtml(book.sku)}
        </p>
      </div>
      <div class="book-actions">
        <div class="action-buttons">
          <button type="button" data-download="${book.checksum}">Download EPUB</button>
          ${
            state.savedPath
              ? `<button type="button" class="secondary" data-show="${escapeHtml(state.savedPath)}">Show in folder</button>`
              : ""
          }
        </div>
        ${statusText ? `<div class="${statusClass}">${escapeHtml(statusText)}</div>` : ""}
      </div>
    `;

    bookList.appendChild(card);
  }

  for (const button of bookList.querySelectorAll("[data-download]")) {
    button.addEventListener("click", () =>
      startDownload(button.getAttribute("data-download")),
    );
  }

  for (const button of bookList.querySelectorAll("[data-show]")) {
    button.addEventListener("click", () =>
      window.bookshop.showInFolder(button.getAttribute("data-show")),
    );
  }
}

async function startDownload(checksum) {
  const button = bookList.querySelector(`[data-download="${checksum}"]`);
  if (button) button.disabled = true;

  downloadState.set(checksum, { status: "Starting..." });
  renderBooks(currentBooks);

  try {
    const savedPath = await window.bookshop.downloadBook(checksum);
    if (savedPath) {
      downloadState.set(checksum, { status: "Done", savedPath });
    } else {
      downloadState.delete(checksum);
    }
  } catch (err) {
    downloadState.set(checksum, {
      status: err instanceof Error ? err.message : "Download failed",
    });
  } finally {
    if (button) button.disabled = false;
    renderBooks(currentBooks);
  }
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!window.bookshop) return;

  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const books = await window.bookshop.login(email, password);
    showLibrary();
    renderBooks(books);
  } catch (err) {
    loginError.hidden = false;
    loginError.textContent =
      err instanceof Error ? err.message : "Sign-in failed";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign in";
  }
});

refreshBtn.addEventListener("click", async () => {
  if (!window.bookshop) return;
  refreshBtn.disabled = true;
  try {
    renderBooks(await window.bookshop.listLibrary());
  } catch (err) {
    alert(err instanceof Error ? err.message : "Refresh failed");
  } finally {
    refreshBtn.disabled = false;
  }
});
