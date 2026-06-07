# Bookshop.org ebook download scripts

Download DRM-free EPUBs from your Bookshop.org library. Works on macOS, Windows, and Linux.

## Setup

```bash
cd scripts
npm install
cp .env.example .env   # add your Bookshop credentials
```

Requires **Node 20+** only.

## Usage

```bash
npm run list-library
npm run download-epub -- <checksum>
```

Output defaults to `../content/<title>.epub`.

```bash
npm run download-epub -- <checksum> --out ../content/MyBook.epub
npm run download-epub -- <checksum> --keep-intermediates
```

For LCP books, the script fetches the license and user key, downloads the encrypted EPUB, decrypts locally, and writes a plain EPUB. DRM-free titles download directly.

Credentials go in `scripts/.env` (gitignored):

```bash
BOOKSHOP_EMAIL=you@example.com
BOOKSHOP_PASSWORD="your-password"
```

Device registration is cached at `~/.bookshop/device-registration.json`.

## Notes

- Personal use only; respect Bookshop terms and copyright.
- API endpoints were recovered from the Bookshop Android app (v2.0.1).
