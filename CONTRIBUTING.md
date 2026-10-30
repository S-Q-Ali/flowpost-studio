# Contributing

Thanks for helping. This repository has two surfaces that share one backend:

- `src/` and `supabase/` — the web dashboard and its edge functions
- `desktop-flutter/` — the native Windows client

Both must stay green; a change to an edge function contract counts as a change to both clients.

## Setup

```bash
npm install
cp .env.example .env.local    # fill in the VITE_ values
npm run dev                   # http://localhost:8080
```

```bash
cd desktop-flutter
flutter pub get
powershell -ExecutionPolicy Bypass -File tool\fetch_ffmpeg.ps1
flutter run -d windows
```

Never commit a real key, token or service-account file. `.env` is ignored; `.env.example` ships and keeps placeholders only. The browser and the desktop client only ever hold the Supabase anon key; the service-role key lives in Supabase secrets.

## Before you open a pull request

Run the same gates CI runs:

```bash
npx tsc --noEmit
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

```bash
cd desktop-flutter
dart format --set-exit-if-changed lib test integration_test
flutter analyze lib test integration_test
flutter test
```

Rules of thumb:

- A bug fix comes with the test that would have caught it.
- New logic with a branch, a loop, a parser or a money/security decision gets a small test.
- Do not weaken a check to make it pass: fix the cause, or leave the check red and say why in the pull request.
- `flutter test` needs the FFmpeg fetched above; the installer test needs Inno Setup.
- Keep the desktop free of login or licence gates: the owner wants the app usable without an account while it is open source.

## Commits and branches

- Branch from `main`; name it for the change (`fix/queue-retry`, `feat/calendar-week`).
- Conventional commit subjects (`fix(edge):`, `docs:`, `chore:`), one concern per commit.
- Do not mix formatting-only changes into a behaviour commit.
- Squash on merge so `main` stays readable.

## Pull requests

- Describe why the change exists, not only what it does.
- List the commands you ran and their results.
- Link the decision record (`docs/adr/`) when the change picks an approach that would be expensive to reverse.
- Keep `main` protected: CI must pass before merge, and direct pushes to `main` are disabled in the repository settings.

## Documentation

- New behaviour updates `README.md` when it changes setup, environment variables or commands.
- An architectural choice gets an ADR in `docs/adr/` (see the existing four for the shape).
- Support, release and rollback notes live in `docs/runbook.md`.
