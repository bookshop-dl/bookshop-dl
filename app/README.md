# bookshop-dl (Electron app)

Cross-platform desktop app to sign in, browse your Bookshop.org library, and download DRM-free EPUBs.

## Development

From the repo root:

```bash
npm install
npm run app
```

## Build installers

```bash
npm run app:dist
```

Installers are written to `app/release/`.

Tagged pushes (`v*`) trigger `.github/workflows/release.yml`, which builds macOS (`.dmg`, `.zip`), Windows (`.exe`), and Linux (`.AppImage`, `.deb`) installers and publishes them to GitHub Releases.
