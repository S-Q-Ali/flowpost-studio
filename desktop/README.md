# FlowPost Desktop - Build Instructions

## 🚀 Quick Start

### Option 1: Pake (Web Wrapper - Recommended for Start)

**Pake wraps your web app in a native container. Fast to build, lightweight.**

**Prerequisites:**
```bash
# Install Pake CLI
npm install -g pake-cli

# Add app icon
# Place icon.ico in public/ folder (256x256 PNG)

# Deploy edge functions
npx supabase functions deploy upload-local-file
```

**Build:**
```bash
# Use the build script
./scripts/build-desktop.bat

# Or manually
npm run build:desktop
```

**Output:** `dist-desktop/` folder

---

### Option 2: Electron (Full Native - For Advanced Features)

**Electron provides full native access. Better for folder watching, system tray, and offline features.**

**Prerequisites:**
```bash
# Install Node.js 18+
# Install Git

# Install desktop dependencies
cd desktop
npm install
```

**Build:**
```bash
# Build web app first
npm run build:web

# Build Electron app
npm run build:electron

# Or build all at once
npm run build
```

**Output:** `dist-electron/` folder

---

## 📁 Folder Structure

```
desktop/
├── src/                      # Electron main process
│   └── main.ts               # Entry point
├── native/                   # Native modules
│   └── folder-watcher.ts     # File system watcher
├── inject/                   # Browser injection scripts
│   └── flowpost.js           # Keyboard shortcuts, notifications
├── pake.config.json          # Pake configuration
├── electron-builder.json     # Electron build config
├── package.json              # Desktop app dependencies
├── tsconfig.json             # TypeScript config
├── README.md                 # This file
└── CHECKLIST.md              # Production checklist
```

---

## 🎯 Features

### ✅ Pake (Current - Production Ready)
- System tray support
- Native notifications
- Keyboard shortcuts (Ctrl+S, Ctrl+P, Ctrl+Q)
- Local file upload
- Google Drive integration
- Offline mode via IndexedDB

### 🚧 Electron (Coming Soon - Full Native)
- **Native folder watcher** - Monitor folders for new files
- **Full system tray menu** - Show, minimize, quit, start workflow
- **Native file system access** - Direct folder monitoring
- **Auto-update** - Built-in update mechanism
- **Code signing** - Professional app signatures
- **Multi-platform** - Windows, Mac, Linux with native builds

---

## 📝 Content Automation Features

### Local File Upload
- Select files directly from computer
- Automatic upload to Cloudflare R2
- Zero-egress delivery for social platforms
- Supports video (MP4, MOV, AVI) and images (JPG, PNG, WEBP)

### Folder Watcher (Desktop Native)
- Monitor folders for new files
- Auto-process added content
- Native file system access via desktop app
- Debounced event handling

### Google Drive Integration
- OAuth authentication
- File browser for Drive content
- Seamless upload to workflows

---

## 🔧 Configuration

### Pake Config (`desktop/pake.config.json`)

```json
{
  "url": "https://flowpost-studio.vercel.app",
  "name": "FlowPost",
  "icon": "public/icon.ico",
  "downloadDir": "%USERPROFILE%\\FlowPost Downloads",
  "showSystemTray": true,
  "hideOnClose": true,
  "maximize": false
}
```

### Electron Config (`desktop/electron-builder.json`)

- Windows: NSIS installer + Portable
- Mac: DMG + App
- Linux: AppImage + DEB

---

## 🏗️ Build Commands

### Pake Build
```bash
npm run build:desktop
```

### Electron Build
```bash
cd desktop
npm run build          # Full build
npm run dist:win       # Windows only
npm run dist:mac       # Mac only  
npm run dist:linux     # Linux only
```

---

## 📦 Distribution

### Windows
- NSIS installer (with uninstaller)
- Portable executable
- Code signing recommended

### Mac
- DMG installer
- Signed app (notarization required)

### Linux
- AppImage (portable)
- DEB package (Ubuntu/Debian)

---

## 🔐 Code Signing (Production)

### Windows
1. Get code signing certificate (DigiCert, GlobalSign, etc.)
2. Add to build:
   ```bash
   electron-builder --win --publish never
   ```
3. Store certificate in environment variables:
   ```bash
   set CODE_SIGN_CERT=your-cert.pfx
   set CODE_SIGN_PASSWORD=your-password
   ```

### Mac
1. Get Apple Developer certificate
2. Notarize with Apple:
   ```bash
   xcrun notarytool submit app.zip
   ```

---

## 🚨 Troubleshooting

### Build fails
- Check Node.js version (18+)
- Clear node_modules and reinstall
- Check Pake/Electron installation

### Icon not showing
- Ensure icon.ico is in public/ folder
- Check icon dimensions (256x256 for Windows)
- Verify pake.config.json has correct icon path

### Folder watcher not working
- Ensure running in Electron, not Pake
- Check folder permissions
- Verify native module compiled correctly

### Tray icon not appearing
- Check OS compatibility
- Verify tray icon file exists
- Check system tray settings

---

## 📚 Resources

- [Pake Documentation](https://github.com/tw93/pake)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Electron Builder](https://www.electron.build/)
- [Node.js Native Modules](https://nodejs.org/api/addons.html)

---

## 🎓 Next Steps

1. **Test locally** - Run `npm run dev` to test before building
2. **Add icon** - Create professional icon for your app
3. **Deploy edge functions** - Run `npx supabase functions deploy upload-local-file`
4. **Build for production** - Use build commands above
5. **Code sign** - Get certificates for production release
6. **Set up auto-update** - Configure update server

---

**Verdict:** Desktop app is production-ready with Pake. Migrate to Electron when you need native folder watching and full system tray menu.

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
