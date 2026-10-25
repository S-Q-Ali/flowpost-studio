# Desktop Build Instructions

## Prerequisites

1. Install [Pake](https://github.com/tw93/pake):
   ```bash
   npm install -g pake-cli
   ```

2. Add app icon to `public/icon.ico` (Windows, 256x256 PNG)

3. Deploy local file upload function:
   ```bash
   npx supabase functions deploy upload-local-file
   ```

## Build Desktop App

```bash
npm run build:desktop
```

This will:
1. Build the web app (`vite build`)
2. Create the desktop app (`pake build`)

Output will be in `dist-desktop/` folder.

## Content Automation Features

### Local File Upload
- Select files directly from computer
- Automatic upload to Cloudflare R2
- Zero-egress delivery for social platforms

### Folder Watcher (Desktop Only)
- Monitor folders for new files
- Auto-process added content
- Native file system access via desktop app

### Google Drive Integration
- OAuth authentication
- File browser for Drive content
- Seamless upload to workflows

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

## Desktop Content Flow

```
1. Upload Files
   - Local: Select from computer → Upload to R2
   - G Drive: Connect → Browse → Select

2. Folder Watcher
   - Desktop: Monitor folder → Auto-detect new files
   - Process: AI captions → Schedule → Publish

3. Content Queue
   - View pending uploads
   - Manage processing status
   - Retry failed items
```
