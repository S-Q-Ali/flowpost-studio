# Desktop Production Checklist

Before releasing desktop app, verify:

## Build
- [ ] `npm run build:desktop` completes successfully
- [ ] App icon is set in `public/icon.ico`
- [ ] No TypeScript errors in build output
- [ ] Build output in `dist-desktop/` folder

## Security
- [ ] No secrets in `package.json` or config files
- [ ] Admin token uses httpOnly cookie pattern (not localStorage)
- [ ] SUPABASE_SERVICE_ROLE_KEY stored in Supabase secrets only
- [ ] CORS configured in `vercel.json`

## Functionality
- [ ] System tray icon appears
- [ ] Minimize to tray works
- [ ] Notification permissions requested
- [ ] Offline queue persists via IndexedDB
- [ ] Error boundary catches crashes

## Testing
- [ ] Test on Windows 10/11
- [ ] Test on different screen sizes
- [ ] Test with no network connection
- [ ] Test keyboard shortcuts (Ctrl+S, Ctrl+P, Ctrl+Q)

## Deployment
- [ ] Version bumped in `desktop/pake.config.json`
- [ ] Changelog updated
- [ ] Tag pushed to GitHub: `git tag -a vX.X.X -m "Release X.X.X"`
- [ ] Build artifacts uploaded to release

## Post-Release
- [ ] Update `appVersion` in pake.config.json
- [ ] Create GitHub release with installer
- [ ] Test auto-update flow (if implemented)
