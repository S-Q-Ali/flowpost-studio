# FlowPost Studio

> Upload once, publish everywhere. Multi-platform video and image scheduling dashboard supporting YouTube Shorts, Instagram Reels & Stories, Facebook Pages, and TikTok.

---

## Features

- **Cross-platform publishing** — Upload a video or image once and distribute to YouTube, Instagram, Facebook, and TikTok simultaneously
- **Image support** — Publish images to Facebook and Instagram (Photo posts + Stories)
- **Scheduled posting** — Set future publish dates per platform (cron-driven every 5 minutes)
- **Content calendar** — Monthly overview of all scheduled and published posts
- **Queue management** — Edit, reschedule, retry, or delete pending posts with bulk operations
- **Google Sheets workflows** — Automatically pull videos or images from a spreadsheet and post on a recurring schedule (3 scheduling modes)
- **Connected accounts** — Manage OAuth connections for YouTube, Facebook, Instagram, and TikTok
- **Progress tracking** — Real-time upload progress and per-platform post status updates
- **YouTube quota monitoring** — Dashboard badges warn when daily quota reaches 50% / 80%
- **TikTok integration** — Beta support with FILE_UPLOAD + DIRECT_POST publishing flow

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack Query |
| **Backend** | Supabase (PostgreSQL, Auth, Edge Functions running Deno) |
| **Storage** | Cloudflare R2 (S3-compatible object storage) |
| **Social APIs** | YouTube Data API v3, Facebook Graph API v25, Instagram Graph API, TikTok API v2 |
| **Hosting** | Vercel (frontend), Supabase (edge functions + database) |
| **Testing** | Vitest, React Testing Library, jsdom |
| **Linting** | ESLint with typescript-eslint |

---

## Project Structure

```
flowpost-studio/
├── src/
│   ├── components/         # UI components (shadcn/ui + custom)
│   │   ├── ui/             # ~40 shadcn/ui primitives
│   │   ├── AppLayout.tsx   # Authenticated app shell with sidebar
│   │   ├── AppSidebar.tsx  # Navigation sidebar
│   │   ├── AppSidebar.tsx  # Navigation sidebar
│   │   ├── BetaBadge.tsx   # Beta indicator badge
│   │   ├── Logo.tsx        # FlowPost logo
│   │   ├── NavLink.tsx     # Active-aware nav link
│   │   ├── PlatformIcon.tsx# Platform icon component
│   │   ├── SecurityQuestionsGate.tsx # Admin 2FA gate
│   │   └── StatusBadge.tsx # Post status badge
│   ├── contexts/
│   │   └── AuthContext.tsx  # Authentication state management
│   ├── hooks/              # Shared React hooks
│   ├── integrations/
│   │   └── supabase/       # Supabase client + DB types
│   ├── lib/
│   │   ├── types.ts        # App type definitions
│   │   ├── utils.ts        # Utility functions
│   │   └── r2.ts           # Direct-to-R2 upload via XHR
│   ├── pages/
│   │   ├── Dashboard.tsx   # Stats overview
│   │   ├── UploadPage.tsx  # Video upload + distribution
│   │   ├── QueuePage.tsx   # Post queue management
│   │   ├── CalendarPage.tsx# Content calendar view
│   │   ├── WorkflowsPage.tsx# Google Sheets workflow management
│   │   ├── AccountsPage.tsx# OAuth account connections
│   │   ├── AuthCallback.tsx# Google OAuth callback handler
│   │   └── NotFound.tsx    # 404 page
│   ├── test/               # Test files
│   ├── App.tsx             # Root component with router
│   └── main.tsx            # Entry point
├── supabase/
│   ├── functions/           # 17 Deno Edge Functions
│   │   ├── _shared/          # Shared modules
│   │   │   ├── crypto.ts         # AES-GCM token encryption
│   │   │   ├── google-jwt.ts     # Google JWT assertion
│   │   │   ├── drive-to-r2.ts    # Drive to R2 media transfer
│   │   │   ├── rate-limit.ts     # Rate limiting helpers
│   │   │   └── sheet-status.ts   # Sheet status update helper
│   │   ├── verify-password/
│   │   ├── verify-session/
│   │   ├── verify-security-questions/
│   │   ├── get-upload-url/
│   │   ├── get-quota-usage/
│   │   ├── youtube-upload/
│   │   ├── youtube-auth/
│   │   ├── facebook-upload/
│   │   ├── facebook-auth/
│   │   ├── instagram-upload/
│   │   ├── tiktok-upload/
│   │   ├── tiktok-auth/
│   │   ├── post-story/
│   │   ├── process-workflow/
│   │   ├── process-scheduled-posts/
│   │   ├── update-sheet-status/
│   │   └── google-oauth/
│   └── migrations/          # 22 database migration files
├── public/                  # Static assets
├── .env.example             # Environment variable template
├── vercel.json              # Vercel deployment config
├── vitest.config.ts         # Test configuration
└── tailwind.config.ts       # Tailwind theme configuration
```

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Browser   │────>│   Supabase   │────>│  YouTube API     │
│  (React)    │     │ Edge Functions│     │  Facebook API    │
│             │     │  (Deno)      │     │  Instagram API   │
│  ┌───────┐  │     │              │     │  TikTok API      │
│  │ R2    │◄─┼────>│  Cloudflare  │     └──────────────────┘
│  │ Upload│  │     │  R2 Storage  │
│  └───────┘  │     └──────────────┘
└─────────────┘
```

**Data flow:**

1. User authenticates via email/password (admin) or Google OAuth (regular users)
2. File is uploaded directly to Cloudflare R2 via a presigned URL
3. A post record is created in Supabase with platform targets
4. For immediate publishing, the frontend calls the appropriate edge function
5. For scheduled posts, a cron job picks up due posts every 5 minutes
6. For Google Sheets workflows, `process-workflow` reads sheets and creates posts
7. TikTok publishes via FILE_UPLOAD + DIRECT_POST flow (SELF_ONLY privacy in Beta)

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the [migrations](supabase/migrations/) applied
- Cloudflare R2 bucket configured
- Facebook app, YouTube project, Instagram Business account, and TikTok developer app with API access

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
npx supabase functions deploy verify-password verify-session verify-security-questions get-upload-url get-quota-usage youtube-upload youtube-auth facebook-upload facebook-auth instagram-upload tiktok-upload tiktok-auth post-story process-workflow process-scheduled-posts update-sheet-status google-oauth
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
| `APP_PASSWORD` | App password for login |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY` | R2 access key ID |
| `R2_SECRET_KEY` | R2 secret access key |
| `R2_BUCKET` | R2 bucket name |
| `R2_PUBLIC_URL` | R2 public URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | GCP service account email for Sheets access |
| `GOOGLE_PRIVATE_KEY` | GCP service account private key |
| `TOKEN_ENCRYPTION_KEY` | 256-bit key for AES-GCM OAuth token encryption |
| `TIKTOK_CLIENT_KEY` | TikTok developer app client key |
| `TIKTOK_CLIENT_SECRET` | TikTok developer app client secret |

Frontend variables (in `.env.local`):

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project reference ID |
| `VITE_R2_PUBLIC_URL` | R2 public URL |

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

---

## Testing

```bash
npm run test
```

The test suite uses Vitest with React Testing Library. Tests cover utility functions (`cn()`), presentational components (`StatusBadge`, `PlatformIcon`), and page rendering (`NotFound`).

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
- [Cloudflare R2](https://developers.cloudflare.com/r2/)

---

## License

Private project. All rights reserved.
