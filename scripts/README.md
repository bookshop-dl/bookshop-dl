# Bookshop.org ebook download scripts

TypeScript CLI tools reverse-engineered from the Bookshop Android app (`index.android.bundle`, v2.0.1). They fetch LCP licenses and assemble LCP EPUBs on macOS without the mobile app.

## Setup

```bash
cd scripts
npm install
```

Requires **Node 20+** and `/usr/bin/unzip` + `/usr/bin/zip` (default on macOS).

## Authentication

The app uses Firebase Auth. Provide credentials via environment variables:

```bash
# Option A: paste a Firebase ID token (from browser devtools / app session)
export BOOKSHOP_ID_TOKEN="eyJhbG..."

# Option B: email + password (uses Firebase REST API + embedded Web API key)
export BOOKSHOP_EMAIL="you@example.com"
export BOOKSHOP_PASSWORD="your-password"
```

## 1. List your library

Find the **checksum** for the book you want:

```bash
npm run list-library
```

## 2. Download the `.lcpl` license

```bash
npm run download-lcpl -- <checksum>
# optional: also save the LCP user key (passphrase) to a sidecar file
npm run download-lcpl -- <checksum> --with-user-key
```

Output defaults to `./<checksum>.lcpl`. Device registration is stored in `~/.bookshop/device-registration.json`.

### API endpoints (from decompilation)

| Step | Method | Path |
|------|--------|------|
| Library | GET | `/api/next/digitalbooks` |
| Register device | POST | `/ebooks/m/devices/register` |
| Validate device | POST | `/ebooks/m/devices/validateregistration` |
| License | GET | `/ebooks/m/contents/{checksum}/license?deviceRegistrationId={id}` |
| User key | GET | `/ebooks/m/contents/{checksum}/key` |
| Encrypted EPUB | GET | `/ebooks/{checksum}/resources/epub_mobile` |

Auth header: `bkshp-firebase-authorization: Bearer <token>`

## 3. Build an LCP EPUB

Uses the publication URL inside the `.lcpl` (standard Readium LCP flow):

```bash
npm run lcpl-to-epub -- ./<checksum>.lcpl
npm run lcpl-to-epub -- ./<checksum>.lcpl --out MyBook.epub
```

This downloads the encrypted publication, inserts `META-INF/license.lcpl`, and re-zips. The result is still **LCP-protected**, not DRM-free.

## 4. Strip LCP DRM (local decrypt)

If you have an LCP EPUB and the passphrase (from `--with-user-key` or Thorium), decrypt locally to a plain EPUB:

```bash
npm run lcp-to-clear-epub -- ./MyBook.epub
# reads ./MyBook.passphrase.txt by default
npm run lcp-to-clear-epub -- ./MyBook.epub --passphrase-file ./MyBook.passphrase.txt --out MyBook-clear.epub
```

This supports Readium **basic-profile** only (what Bookshop uses). It removes `META-INF/encryption.xml` and `META-INF/license.lcpl`, decrypts all listed resources, and re-zips.

## 5. Read the book

1. Install [Thorium Reader](https://www.edrlab.org/software/thorium-reader/) (free, macOS).
2. Open the `.epub` or drag it into Thorium.
3. Enter your **passphrase** when prompted.
   - If you used `--with-user-key`, the passphrase is in `<checksum>.passphrase.txt`.
   - The license `text_hint` field may describe what to enter (often account-related).

Thorium works offline after the first successful unlock.

## 6. DRM-free titles

If `list-library` shows `drm-free`, Bookshop also exposes:

`GET /ebooks/{checksum}/resources/direct_download`

Those are plain EPUBs — use Bookshop’s official Download/Transfer in the app or website when available. These scripts target **LCP** books.

## Notes

- `assets/prod-license.lcpl` in the APK is an EDRLab **sample** license, not a purchased book.
- API behavior may change; endpoints were recovered via `hermes-decomp` from the shipped bundle.
- Personal use only; respect Bookshop terms and copyright.
