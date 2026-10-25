# Deployment Guide

## Prerequisites

1. **Supabase Project** with edge functions enabled
2. **Cloudflare R2** bucket configured
3. **Pake CLI** installed (`npm install -g pake-cli`)
4. **Google Drive API** OAuth credentials
5. **Social Platform** OAuth credentials

## Deploy Edge Functions

```bash
# Deploy all edge functions
npx supabase functions deploy \
  verify-password \
  verify-session \
  verify-security-questions \
  get-quota-usage \
  youtube-upload \
  youtube-auth \
  facebook-upload \
  facebook-auth \
  instagram-upload \
  tiktok-upload \
  tiktok-auth \
  linkedin-upload \
  linkedin-auth \
  post-story \
  process-workflow \
  process-scheduled-posts \
  update-sheet-status \
  google-drive-auth \
  mega-auth \
  get-file \
  generate-ai-captions \
  upload-local-file \
  drive-to-mega \
  transfer-ticket \
  fetch-instagram-insights \
  fetch-facebook-insights
```

## Deploy Database

```bash
npx supabase db push
```

## Desktop App Build

```bash
# 1. Build web app
npm run build

# 2. Build desktop app
npm run build:desktop
```

Output: `dist-desktop/` folder

## Environment Variables

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

### Required
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `SUPABASE_ANON_KEY` - Public anon key
- `FRONTEND_API_KEY` - API key for frontend functions
- `CRON_API_KEY` - API key for cron triggers
- `ALLOWED_ORIGIN` - Frontend URL (e.g., `https://flowpost-studio.vercel.app`)

### Google Drive
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `GD_CLIENT_ID` - Drive API client ID
- `GD_CLIENT_SECRET` - Drive API client secret
- `GOOGLE_PRIVATE_KEY` - Service account private key
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email

### Cloudflare R2
- `R2_ENDPOINT` - R2 endpoint URL
- `R2_ACCESS_KEY` - R2 access key ID
- `R2_SECRET_KEY` - R2 secret access key
- `R2_BUCKET` - R2 bucket name
- `R2_PUBLIC_URL` - Public bucket hostname

### Social Platforms
- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`
- `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`

### AI
- `GROQ_API_KEY` - Groq API key for captions

### Token Encryption
- `TOKEN_ENCRYPTION_KEY` - 256-bit AES-GCM key (base64 encoded)

## Testing Checklist

1. **Upload Flow**
   - Local file upload → R2 cache
   - G Drive file selection → Upload
   - AI caption generation works

2. **Publishing**
   - YouTube upload succeeds
   - Facebook/Instagram posts created
   - Status updates correctly

3. **Desktop**
   - System tray appears
   - Minimize to tray works
   - Notifications appear
   - Folder watcher monitors (desktop only)

4. **Offline**
   - Queue persists via IndexedDB
   - Posts sync when online
   - Error recovery works

## Production Deployment

```bash
# 1. Build
npm run build

# 2. Deploy to Vercel
vercel --prod

# 3. Deploy desktop app
npm run build:desktop

# 4. Tag release
git tag -a v1.0.0 -m "Production release"
git push origin v1.0.0

# 5. Update pake.config.json version
# Update appVersion to match tag
```

## Monitoring

- **Supabase Logs**: Check edge function logs
- **R2 Analytics**: Monitor storage and egress
- **Error Tracking**: Use ErrorBoundary logs
- **User Metrics**: Track upload success rates

## Troubleshooting

### Upload fails
- Check R2 bucket CORS configuration
- Verify SUPABASE_SERVICE_ROLE_KEY
- Test file size limits

### G Drive connection fails
- Verify OAuth credentials
- Check service account permissions
- Review Supabase logs

### Desktop app doesn't build
- Ensure Pake CLI installed
- Check public/icon.ico exists
- Verify pake.config.json syntax
