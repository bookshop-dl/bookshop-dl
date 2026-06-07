# bookshop-dl CLI

Download DRM-free EPUBs from your Bookshop.org library. Shared logic lives in `../lib/`.

## Setup

From the repo root:

```bash
npm install
cp scripts/.env.example scripts/.env   # add your credentials
```

Requires **Node 20+**.

## Usage

```bash
npm run list-library
npm run download-epub -- <checksum>
```

Output defaults to `content/<title>.epub`.

Credentials in `scripts/.env` (gitignored):

```bash
BOOKSHOP_EMAIL=you@example.com
BOOKSHOP_PASSWORD="your-password"
```

## Desktop app

See `../app/README.md` for the installable Electron GUI.
