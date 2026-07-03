# FlowPost Studio

> Multi-platform video scheduling and auto-distribution dashboard. Upload once, publish to YouTube Shorts, Instagram Reels, and Facebook Pages from a single interface.

---

## Features

- **Cross-platform publishing** — Upload a video once and distribute to YouTube, Instagram, and Facebook simultaneously
- **Scheduled posting** — Set future publish dates per platform
- **Content calendar** — Monthly overview of all scheduled and published posts
- **Queue management** — Edit, reschedule, or delete pending posts
- **Google Sheets workflows** — Automatically pull videos from a spreadsheet and post on a recurring schedule
- **Connected accounts** — Manage OAuth connections for all your social channels
- **Progress tracking** — Real-time upload progress and post status updates

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack Query |
| **Backend** | Supabase (PostgreSQL, Auth, Edge Functions running Deno) |
| **Storage** | Cloudflare R2 (S3-compatible object storage) |
| **Social APIs** | YouTube Data API v3, Facebook Graph API v18, Instagram Basic Display API |
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
│   │   ├── PasswordGate.tsx# Login page (app password + Google OAuth)
│   │   ├── PlatformIcon.tsx# Platform icon component
│   │   └── StatusBadge.tsx # Post status badge
│   ├── contexts/
│   │   └── AuthContext.tsx  # Authentication state management
│   ├── hooks/              # Shared React hooks
│   ├── integrations/
│   │   └── supabase/       # Supabase client + DB types
│   ├── lib/
│   │   ├── types.ts        # App type definitions
│   │   ├── constants.ts    # Shared constants
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
│   ├── functions/           # 16 Deno Edge Functions
│   │   ├── verify-password/
│   │   ├── verify-session/
│   │   ├── verify-security-questions/
│   │   ├── get-upload-url/
│   │   ├── youtube-upload/
│   │   ├── youtube-auth/
│   │   ├── facebook-upload/
│   │   ├── facebook-auth/
│   │   ├── instagram-upload/
│   │   ├── post-story/
│   │   ├── process-workflow/
│   │   ├── process-scheduled-posts/
│   │   ├── update-sheet-status/
│   │   ├── google-oauth/
│   └── migrations/          # Database migration files
├── public/                  # Static assets
├── .env.example             # Environment variable template
├── vercel.json              # Vercel deployment config
├── vitest.config.ts         # Test configuration
└── tailwind.config.ts       # Tailwind theme configuration
```

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Browser   │────>│   Supabase   │────>│  YouTube API    │
│  (React)    │     │ Edge Functions│     │  Facebook API   │
│             │     │  (Deno)      │     │  Instagram API  │
│  ┌───────┐  │     │              │     └─────────────────┘
│  │ R2    │◄─┼────>│  Cloudflare  │
│  │ Upload│  │     │  R2 Storage  │
│  └───────┘  │     └──────────────┘
└─────────────┘
```

**Data flow:**

1. User authenticates via app password or Google OAuth
2. Video is uploaded directly to Cloudflare R2 via a presigned URL
3. A post record is created in Supabase with platform targets
4. For immediate publishing, the frontend calls the appropriate edge function
5. For scheduled posts, a cron job (`process-scheduled-posts`) picks up due posts
6. For Google Sheets workflows, `process-workflow` reads sheets and creates posts

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the [migrations](supabase/migrations/) applied
- Cloudflare R2 bucket configured
- Facebook app, YouTube project, and Instagram Business account with API access

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
npx supabase functions deploy verify-password verify-session verify-security-questions get-upload-url youtube-upload youtube-auth facebook-upload facebook-auth instagram-upload post-story process-workflow process-scheduled-posts update-sheet-status google-oauth
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
| `SB_URL` | Supabase project URL |
| `SB_SERVICE_ROLE_KEY` | Supabase service role key |
| `ALLOWED_ORIGIN` | Frontend URL for CORS (e.g. `https://flowpost-studio.vercel.app`) |
| `APP_PASSWORD` | App password for login |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY` | R2 access key ID |
| `R2_SECRET_KEY` | R2 secret access key |
| `R2_BUCKET` | R2 bucket name |
| `R2_PUBLIC_URL` | R2 public URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | GCP service account email for Sheets access |
| `GOOGLE_PRIVATE_KEY` | GCP service account private key |

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

- **Row Level Security** — All tables have RLS enabled. The frontend (anon key) is scoped to the admin UUID via policies
- **CORS** — Restricted via the `ALLOWED_ORIGIN` environment variable on all edge functions
- **Rate Limiting** — Login and security question endpoints have rate limiting (5 attempts, 15-minute lockout)
- **SSRF Protection** — Upload functions validate URLs against a domain whitelist before fetching
- **Sensitive Columns** — OAuth tokens are hidden behind a database view, accessible only to service role
- **Secrets Management** — All credentials are stored in Supabase Edge Function secrets, never in the codebase

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
- [Facebook Graph API v18](https://developers.facebook.com/docs/graph-api)
- [Instagram Basic Display API](https://developers.facebook.com/docs/instagram-basic-display-api)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)

---

## License

Private project. All rights reserved.
