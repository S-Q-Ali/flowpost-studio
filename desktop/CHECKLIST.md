# Desktop Production Checklist

## ✅ Current: Pake (Web Wrapper)

### Build
- [x] `npm run build:desktop` script in package.json
- [x] App icon path configured in `desktop/pake.config.json`
- [ ] App icon file exists at `public/icon.ico`
- [ ] Deploy `upload-local-file` edge function
- [ ] Test build completes without errors

### Security
- [x] Admin token uses memory-only (not localStorage)
- [x] SUPABASE_SERVICE_ROLE_KEY in Supabase secrets
- [x] Local file upload validates types and sizes (5GB max)
- [x] CORS configured in `vercel.json`
- [ ] No secrets committed to git

### Functionality
- [x] System tray component created
- [ ] Minimize to tray works (Pake native)
- [ ] Notification permissions requested
- [x] Offline queue persists via IndexedDB
- [x] Error boundary catches crashes
- [x] Local file upload works (up to 5GB)
- [x] Google Drive OAuth integration works
- [ ] Folder watcher in desktop app (Pake limited)
- [x] Content queue displays items correctly

### Testing
- [ ] Test on Windows 10/11
- [ ] Test on different screen sizes
- [ ] Test with no network connection
- [ ] Test keyboard shortcuts (Ctrl+S, Ctrl+P, Ctrl+Q)
- [ ] Test local file upload (video & image)
- [ ] Test G Drive file picker
- [ ] Verify tray icon appears

### Deployment
- [ ] Version bumped in `desktop/pake.config.json`
- [ ] Desktop README complete
- [ ] Tag pushed to GitHub
- [ ] Build artifacts ready for release

---

## 🚧 Coming: Electron (Full Native)

### Native Folder Watcher
- [ ] `desktop/native/folder-watcher.ts` compiled
- [ ] Folder watcher integration in main process
- [ ] Debounced file event handling
- [ ] Extension filtering (.mp4, .mov, .jpg, .png)
- [ ] IPC handlers for web ↔ native communication

### Full System Tray
- [ ] System tray menu with show/quit/actions
- [ ] Minimize to tray on close
- [ ] Double-click to restore
- [ ] Context menu integration

### Auto-Update
- [ ] Electron updater configured
- [ ] Update server set up (GitHub releases)
- [ ] Update trigger on app startup
- [ ] Silent background updates
- [ ] User notification for restart

### Code Signing
- [ ] Windows code signing certificate purchased
- [ ] Mac notarization configured
- [ ] Build scripts configured for signing
- [ ] Test signed builds

### Multi-Platform
- [ ] Windows NSIS installer
- [ ] Windows portable build
- [ ] Mac DMG + signed app
- [ ] Linux AppImage + DEB

---

## 📋 Migration Path: Pake → Electron

### When to Migrate
- Need native folder watching
- Need full system tray menu
- Need auto-update built-in
- Need offline-first with file sync
- Need better performance for heavy tasks

### Migration Steps
1. Install Electron dependencies: `cd desktop && npm install`
2. Set up main process: `desktop/src/main.ts`
3. Migrate components to use IPC
4. Test all features
5. Build for each platform
6. Code sign for production

---

## 🎯 Priority Order

**Must Have (Pake):**
1. ✅ Build script
2. ✅ Local file upload
3. ✅ G Drive integration
4. ✅ Error boundary
5. ✅ Offline mode
6. ⚠️ Add icon file
7. ⚠️ Test build
8. ⚠️ Deploy edge function

**Should Have (Electron):**
1. Native folder watcher
2. Full system tray
3. Auto-update
4. Code signing
5. Multi-platform builds

**Nice to Have:**
1. Better performance optimizations
2. Native file sync
3. Advanced offline mode
4. Desktop-specific UI tweaks

---

## 📊 Current Status

| Feature | Pake | Electron |
|---------|------|----------|
| Build Script | ✅ | ⚠️ Setup needed |
| Local Upload | ✅ | ✅ (via web) |
| G Drive | ✅ | ✅ (via web) |
| Folder Watcher | ❌ | ⚠️ Implemented |
| System Tray | ⚠️ Basic | ⚠️ Setup needed |
| Auto-Update | ❌ | ⚠️ Config needed |
| Offline Mode | ✅ | ✅ |
| Code Signing | ⚠️ Manual | ⚠️ Config needed |
| Multi-Platform | ✅ | ⚠️ Config needed |

**Verdict:** Start with Pake (production ready). Migrate to Electron when you need native folder watching and full system tray.
