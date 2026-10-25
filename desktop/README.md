# Desktop Build Instructions

## Prerequisites

1. Install [Pake](https://github.com/tw93/pake):
   ```bash
   npm install -g pake-cli
   ```

2. Add app icon to `public/icon.ico` (Windows, 256x256 PNG)

## Build Desktop App

```bash
npm run build:desktop
```

This will:
1. Build the web app (`vite build`)
2. Create the desktop app (`pake build`)

Output will be in `dist-desktop/` folder.

## Auto-Update (Optional)

Add auto-updater script to `desktop/update.js`:

```javascript
// desktop/update.js
const { autoUpdater } = require('electron-updater');
// Configure update server and trigger checks
```

## System Tray Implementation

See `src/components/SystemTray.tsx` for tray menu implementation.

## Code Signing (Windows)

For production signing:
1. Get code signing certificate
2. Add to build script:
   ```bash
   pake build --config desktop/pake.config.json --sign certificate.pfx
   ```
