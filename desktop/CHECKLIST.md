# Desktop Production Checklist

Before releasing desktop app, verify:

## Build
- [ ] `npm run build:desktop` completes successfully
- [ ] App icon is set in `public/icon.ico`
- [ ] No TypeScript errors in build output
- [ ] Build output in `dist-desktop/` folder
- [ ] Deploy `upload-local-file` edge function

## Security
- [ ] No secrets in `package.json` or config files
- [ ] Admin token uses httpOnly cookie pattern (not localStorage)
- [ ] SUPABASE_SERVICE_ROLE_KEY stored in Supabase secrets only
- [ ] CORS configured in `vercel.json`
- [ ] Local file upload validates file types and sizes

## Functionality
- [ ] System tray icon appears
- [ ] Minimize to tray works
- [ ] Notification permissions requested
- [ ] Offline queue persists via IndexedDB
- [ ] Error boundary catches crashes
- [ ] Local file upload works (up to 5GB)
- [ ] Google Drive OAuth integration works
- [ ] Folder watcher active in desktop (native FS access)
- [ ] Content queue displays items correctly

## Testing
- [ ] Test on Windows 10/11
- [ ] Test on different screen sizes
- [ ] Test with no network connection
- [ ] Test keyboard shortcuts (Ctrl+S, Ctrl+P, Ctrl+Q)
- [ ] Test local file upload (video & image)
- [ ] Test G Drive file picker
- [ ] Test folder auto-detection (desktop only)

## Deployment
- [ ] Version bumped in `desktop/pake.config.json`
- [ ] Changelog updated
- [ ] Tag pushed to GitHub: `git tag -a vX.X.X -m "Release X.X.X"`
- [ ] Build artifacts uploaded to release
- [ ] Edge functions deployed: `upload-local-file`

## Post-Release
- [ ] Update `appVersion` in pake.config.json
- [ ] Create GitHub release with installer
- [ ] Test auto-update flow (if implemented)
- [ ] Monitor R2 storage costs
- [ ] Test folder watcher reliability
