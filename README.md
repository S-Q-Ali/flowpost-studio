# FlowPost Studio

> Upload once, publish everywhere. Multi-platform video and image scheduling dashboard supporting YouTube Shorts, Instagram Reels & Stories, Facebook Pages, and TikTok.

---

## Features

> **Note:** Meta's AI voice translation + lip-sync for Reels is currently only available through the native Instagram/Facebook apps, not via the Graph API. Toggle support in FlowPost prepares for future API support. See `SESSION_STATE.md` entry #50 for full investigation details.

- **Cross-platform publishing** — Upload a video or image once and distribute to YouTube, Instagram, Facebook, and TikTok simultaneously
- **Meta AI translation support** — Toggle to mark reels for Meta AI dubbing + lip-sync (feature pending Graph API exposure; toggles serve as intent flags for future support)
- **Image support** — Publish images to Facebook and Instagram (Photo posts + Stories)
- **Scheduled posting** — Set future publish dates per platform (cron-driven every 5 minutes)
- **Content calendar** — Monthly overview of all scheduled and published posts
- **Queue management** — Edit, reschedule, retry, or delete pending posts with bulk operations
- **Google Sheets workflows** — Automatically pull videos or images from a spreadsheet and post on a recurring schedule (3 scheduling modes)
- **Cloudflare R2 cache** — Drive-sourced workflow videos are cached to R2; Facebook, Instagram, and stories fetch from R2 at zero Supabase egress
- **Connected accounts** — Manage OAuth connections for YouTube, Facebook, Instagram, TikTok, and Google Drive
- **Mega integration** — Connect your Mega account or use public share links as an alternate file source alongside Google Drive
- **Progress tracking** — Real-time upload progress and per-platform post status updates
- **YouTube quota monitoring** — Dashboard badges warn when daily quota reaches 50% / 80%
- **TikTok integration** — Beta support with FILE_UPLOAD + DIRECT_POST publishing flow
- **Insights dashboard** — Instagram and Facebook analytics with adaptive charts

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack Query |
| **Backend** | Supabase (PostgreSQL, Auth, Edge Functions running Deno) |
| **File Storage** | Google Drive (per-user OAuth) + Mega (authenticated or public links) + Cloudflare R2 (workflow cache) |
| **Social APIs** | YouTube Data API v3, Facebook Graph API v25, Instagram Graph API, TikTok API v2 |
| **AI / Translation** | Meta AI dubbing (native app only, no API), SeamlessM4T (self-hostable) |
| **Hosting** | Vercel (frontend), Supabase (edge functions + database) |
| **Testing** | Vitest, React Testing Library, jsdom |
| **Linting** | ESLint with typescript-eslint |

---

## Project Structure

```
flowpost-studio/
├── src/
│   ├── components/           # UI components (shadcn/ui + custom)
│   │   ├── ui/               # ~16 shadcn/ui primitives
│   │   ├── AppLayout.tsx     # Authenticated app shell with sidebar
│   │   ├── AppSidebar.tsx    # Navigation sidebar
│   │   ├── BetaBadge.tsx     # Beta indicator badge (TikTok)
│   │   ├── Logo.tsx          # FlowPost logo
│   │   └── StatusBadge.tsx   # Post status badge
│   ├── contexts/
│   │   └── AuthContext.tsx    # Authentication state management
│   ├── hooks/                 # Shared React hooks
│   ├── integrations/
│   │   └── supabase/          # Supabase client + DB types
│   ├── lib/
│   │   ├── types.ts           # App type definitions
│   │   └── utils.ts           # Utility functions
│   ├── pages/
│   │   ├── Dashboard.tsx      # Stats overview
│   │   ├── UploadPage.tsx     # Video upload + distribution
│   │   ├── QueuePage.tsx      # Post queue management
│   │   ├── CalendarPage.tsx   # Content calendar view
│   │   ├── InsightsPage.tsx   # Instagram / Facebook analytics
│   │   ├── WorkflowsPage.tsx  # Google Sheets workflow management
│   │   ├── AccountsPage.tsx   # OAuth account connections + Mega
│   │   ├── LoginPage.tsx      # Email/password + Google OAuth login
│   │   └── NotFound.tsx       # 404 page
│   ├── App.tsx                # Root component with router
│   └── main.tsx               # Entry point
├── supabase/
│   ├── functions/              # 23 Deno Edge Functions
│   │   ├── _shared/             # Shared modules
│   │   │   ├── crypto.ts             # AES-GCM token encryption
│   │   │   ├── rate-limit.ts         # Rate limiting helpers
│   │   │   └── sheet-status.ts       # Sheet status update helper
│   │   ├── verify-password/
│   │   ├── verify-session/
│   │   ├── verify-security-questions/
│   │   ├── get-quota-usage/
│   │   ├── get-file/                 # Drive/Mega file proxy
│   │   ├── youtube-upload/
│   │   ├── youtube-auth/
│   │   ├── facebook-upload/
│   │   ├── facebook-auth/
│   │   ├── instagram-upload/
│   │   ├── tiktok-upload/
│   │   ├── tiktok-auth/
│   │   ├── post-story/
│   │   ├── process-workflow/        # R2 cache for Drive-sourced videos
│   │   ├── process-scheduled-posts/
│   │   ├── update-sheet-status/
│   │   ├── google-drive-auth/        # Drive OAuth flow
│   │   ├── google-oauth/             # Google sign-in OAuth
│   │   ├── mega-auth/                # Mega account management
│   │   ├── drive-to-mega/            # Browser-streamed Drive→Mega transfer
│   │   ├── transfer-ticket/          # Temporary Mega session credentials
│   │   ├── fetch-instagram-insights/
│   │   └── fetch-facebook-insights/
│   └── migrations/            # 22 database migration files
├── public/                    # Static assets
├── .env.example               # Environment variable template
└── vercel.json                # Vercel deployment config
```

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Browser   │────>│    Supabase      │────>│  YouTube API     │
│  (React)    │     │  Edge Functions   │     │  Facebook API    │
│             │     │    (Deno)        │     │  Instagram API   │
│  ┌───────┐  │     │                  │     │  TikTok API      │
│  │ Drive │  │     │  ┌────────────┐  │     └──────────────────┘
│  │ OAuth │  │     │  │process-    │  │
│  └───────┘  │     │  │workflow    │──┤──── R2 URL (0 egress)
│             │     │  └───┬───┬────┘  │
│  ┌───────┐  │     │      │   │       │
│  │ Mega  │  │     │  ┌───┴───┴────┐  │
│  │ Auth  │  │     │  │ get-file   │  │
│  └───────┘  │     │  │ proxy      │  │
│             │     │  └─────┬──────┘  │
│             │     │        │         │
│             │     │  ┌─────┴──────┐  │
│             │     │  │ Cloudflare │  │
│             │     │  │ R2 (cache) │  │
│             │     │  └────────────┘  │
└─────────────┘     └──────────────────┘
```

**Data flow:**

1. User authenticates via email/password (admin) or Google OAuth (regular users)
2. File sources: Google Drive (per-user OAuth) or Mega (authenticated or public links)
3. For Google Sheets workflows, `process-workflow` reads sheets, resolves each row's source (Drive URL, Mega URL, or `mega:filename` pattern), and creates posts
4. For Drive-sourced videos, `process-workflow` uploads the file to Cloudflare R2 (presigned URL + raw PUT) and updates the video record with the R2 URL
5. Facebook, Instagram, and story posts serve the R2 URL directly — **zero Supabase egress** per platform. If R2 upload fails, the `get-file` proxy acts as a fallback (1× egress)
6. Mega-sourced files and manual uploads still use the `get-file` proxy to stream files directly to the target platform
7. For immediate publishing, posts fire directly; for scheduled posts, a cron job picks up due posts every 5 minutes
8. TikTok publishes via FILE_UPLOAD + DIRECT_POST flow (SELF_ONLY privacy in Beta)
9. All OAuth tokens are encrypted at rest with AES-GCM

**Sheet `video_url` supports 3 formats:**
```
https://drive.google.com/...  → Drive API
https://mega.nz/file/HASH#KEY → Mega public link (anonymous)
mega:filename.mp4             → Mega authenticated (account lookup)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the [migrations](supabase/migrations/) applied
- Facebook app, YouTube project, Instagram Business account, TikTok developer app, and Google Cloud OAuth client

### Local Development

```bash
# Clone the repository
git clone <repo-url>
cd flowpost-studio

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your credentials

# Start the development server
npm run dev
```

### Deploy Edge Functions

```bash
# Install Supabase CLI (if not already installed)
npm install supabase --save-dev

# Link to your project
npx supabase link

# Deploy all functions
npx supabase functions deploy verify-password verify-session verify-security-questions get-quota-usage youtube-upload youtube-auth facebook-upload facebook-auth instagram-upload tiktok-upload tiktok-auth post-story process-workflow process-scheduled-posts update-sheet-status google-drive-auth mega-auth get-file fetch-instagram-insights fetch-facebook-insights
```

### Deploy Database Migrations

```bash
npx supabase db push
```

---

## Environment Variables

Set these in **Supabase Dashboard → Edge Functions → Secrets**:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ALLOWED_ORIGIN` | Frontend URL for CORS (e.g. `https://flowpost-studio.vercel.app`) |
| `CRON_API_KEY` | API key for cron-triggered functions |
| `FRONTEND_API_KEY` | Anon key for frontend-called functions |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (sign-in + Drive) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GD_CLIENT_ID` | Google Drive OAuth client ID |
| `GD_CLIENT_SECRET` | Google Drive OAuth client secret |
| `TOKEN_ENCRYPTION_KEY` | 256-bit key for AES-GCM OAuth token encryption |
| `TIKTOK_CLIENT_KEY` | TikTok developer app client key |
| `TIKTOK_CLIENT_SECRET` | TikTok developer app client secret |
| `YOUTUBE_CLIENT_ID` | YouTube OAuth client ID |
| `YOUTUBE_CLIENT_SECRET` | YouTube OAuth client secret |
| `FACEBOOK_CLIENT_ID` | Facebook app ID |
| `FACEBOOK_CLIENT_SECRET` | Facebook app secret |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | GCP service account email for Sheets access |
| `GOOGLE_PRIVATE_KEY` | GCP service account private key |
| `R2_ENDPOINT` | Cloudflare R2 S3 endpoint URL |
| `R2_ACCESS_KEY` | Cloudflare R2 access key ID |
| `R2_SECRET_KEY` | Cloudflare R2 secret access key |
| `R2_BUCKET` | Cloudflare R2 bucket name |
| `R2_PUBLIC_URL` | Cloudflare R2 public bucket hostname (e.g. `pub-xxxxxxxxxxxx.r2.dev`) |

Frontend variables (in `.env.local`):

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project reference ID |

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start dev server on port 8080 |
| `build` | `npm run build` | Production build |
| `test` | `npm run test` | Run test suite |
| `test:watch` | `npm run test:watch` | Run tests in watch mode |
| `lint` | `npm run lint` | Lint all source files |
| `preview` | `npm run preview` | Preview production build locally |

---

## Security

- **Row Level Security** — All tables have RLS enabled with per-user policies
- **Token Encryption** — All OAuth tokens encrypted at rest with AES-GCM (`TOKEN_ENCRYPTION_KEY`)
- **CORS** — Restricted via the `ALLOWED_ORIGIN` environment variable on all edge functions
- **Rate Limiting** — Login and security question endpoints have rate limiting (5 attempts, 15-minute lockout)
- **SSRF Protection** — Upload functions validate URLs against a domain whitelist before fetching
- **Secrets Management** — All credentials are stored in Supabase Edge Function secrets, never in the codebase
- **Admin 2FA** — Admin users must answer security questions after email sign-in
- **New signups blocked** — Only existing `public.users` records can authenticate

---

## Testing

```bash
npm run test
```

The test suite uses Vitest with React Testing Library.

---

## Deployment

### Frontend (Vercel)

The frontend auto-deploys from the Git repository. Vercel detects the Vite configuration and builds automatically.

### Edge Functions (Supabase)

```bash
npx supabase functions deploy <function-name>
```

### Database (Supabase)

```bash
npx supabase db push
```

---

## API References

- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [Facebook Graph API](https://developers.facebook.com/docs/graph-api)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
- [TikTok API](https://developers.tiktok.com/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [MegaJS](https://github.com/tonistiigi/megajs)
- [Meta AI dubbing for Reels](https://creators.facebook.com/blog/meta-ai-translations) (native app only, no API available)

---

## License

Private project. All rights reserved.