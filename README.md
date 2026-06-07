# Bookshop Download

Download DRM-free EPUBs from your [Bookshop.org](https://bookshop.org) library.

## Project layout

| Path | Purpose |
|------|---------|
| `lib/` | Shared API client, LCP decrypt, download logic |
| `scripts/` | CLI (`list-library`, `download-epub`) |
| `app/` | Electron desktop app |
| `content/` | Default CLI output (gitignored) |

## Quick start

```bash
npm install
cp scripts/.env.example scripts/.env   # CLI credentials

npm run list-library
npm run download-epub -- <checksum>

npm run app          # open desktop app
npm run app:dist     # build installers → app/release/
```

## Releases

Push a version tag to build installers for macOS, Windows, and Linux via GitHub Actions:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Installers are attached to the GitHub Release for that tag.

See `scripts/README.md` and `app/README.md` for details.
