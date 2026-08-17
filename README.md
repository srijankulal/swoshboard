# Swoshboard

Your own personal backup dashboard. Store files (up to **200 MB** per account) in your private Cloudinary space and email them anywhere — mail is always handled by **Swoshmail**, a separate email-sending service that Swoshboard calls over HTTP.

Next.js 16 (App Router, TypeScript), Turso (libSQL) for users/sessions/file metadata, Cloudinary for file storage, sessions via httpOnly cookies. Zero self-hosted infra beyond the app itself.

## Features

- Register / login with an account; passwords are **bcrypt-hashed**, and your *secret passage* (a word or number used to reset a forgotten password) is **AES-256-GCM encrypted** with a master key.
- Simple DB-backed sessions (7-day httpOnly cookie, login attempt lockout after 5 failures, 15 min).
- Full file manager: **folders** (create / rename / delete recursively), **move files** between folders, and **folder upload** — drag a whole folder or use "Upload Folder" and the structure is recreated (10 MB per-file limit, all file types).
- Drag-and-drop upload straight from the browser to Cloudinary (signed upload params, `authenticated` access mode), so file size is not limited by the serverless body cap.
- Per-user quota (default 200 MB) and per-file cap (default 10 MB), both enforced server-side and verified against Cloudinary metadata.
- Download via signed Cloudinary URLs; delete removes the resource.
- Quick Mail panel: select files, fill recipient/subject/notes, Swoshboard hands signed attachment URLs to the Swoshmail API which does the actual sending.
- Terms & Conditions checkbox at signup naming you responsible for the legality of everything you store.
- Password/secret-passage inputs have an eye toggle to reveal what you typed.
- Same glassmorphism theme, "Powered by Swoshmail" footer everywhere.

## Setup

1. `npm install`
2. Get a free Turso database: `https://turso.tech` → create DB → `TURSO_DATABASE_URL` (remote `libsql://...`) + `TURSO_AUTH_TOKEN`. **Required in production** — Vercel etc. have no persistent filesystem, so without a remote DB the app fails at startup. For local dev you can skip Turso entirely: the app falls back to a local SQLite file (`file:./swoshboard.db`, auto-created).
3. Cloudinary account → *Settings → API Keys* → paste `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` into `.env`.
4. Generate a random string for `SWOSH_MASTER_KEY` (encrypts secret passages — changing it breaks password resets for existing users).
5. Point `SWOSHMAIL_API_URL` / `SWOSHMAIL_API_KEY` at the Swoshmail service (see [`docs/SWOSHMAIL-API.md`](docs/SWOSHMAIL-API.md) for the contract the Swoshmail owner must implement).
6. `npm run dev` → http://localhost:3000

There is no `.env.example`; all variables are documented in `.env` (gitignored) and in this file.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TURSO_DATABASE_URL` | no | `file:./swoshboard.db` | libSQL URL (Turso remote or local file) |
| `TURSO_AUTH_TOKEN` | for remote | — | Turso/auth token for `libsql://` URLs |
| `CLOUDINARY_CLOUD_NAME` | yes | — | Cloudinary account |
| `CLOUDINARY_API_KEY` | yes | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | yes | — | Cloudinary API secret (used to sign uploads/URLs) |
| `SWOSH_MASTER_KEY` | yes | — | AES key source; hashes to 32 bytes for secret-passage encryption |
| `SWOSHMAIL_API_URL` | yes* | — | Base URL of the Swoshmail mail API (mail panel disabled without it) |
| `SWOSHMAIL_API_KEY` | yes* | — | Bearer token sent to Swoshmail |
| `STORAGE_LIMIT_MB` | no | `200` | Per-user storage quota |
| `SESSION_TTL_DAYS` | no | `7` | Session lifetime |
| `MAX_FILE_MB` | no | `10` | Per-file upload size cap |

\* required for the mail panel; uploads/downloads work without them.

## Deploying

- **Vercel** (free-tier friendly): set the env vars above. Uploads bypass the serverless body limit because files go browser → Cloudinary directly; `/api/files/upload-sign`, `/api/files` etc. only exchange small JSON. Run a [migrate step](https://www.npmjs.com/package/@libsql/client) before first deploy — schema is created automatically on server start via `instrumentation.ts`, so you don't need to do anything.
- The Turso DB must be reachable from the deploy platform. For Vercel Hobby, remote Turso works; for local SQLite you must self-host (Render/VPS).

## Commands

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint` — eslint (flat config). No tests exist; `npm run build` is the only typecheck.

## API surface (Swoshboard)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | email, password, secret passage, terms |
| POST | `/api/auth/login` | — | sets session cookie |
| POST | `/api/auth/logout` | cookie | clears session |
| POST | `/api/auth/reset` | — | email + secret passage ⇒ new password |
| GET | `/api/auth/me` | cookie | session check |
| GET | `/api/files` | cookie | list files + usage |
| POST | `/api/files/upload-sign` | cookie | signed Cloudinary upload params |
| POST | `/api/files` | cookie | register a completed upload (quota verify) |
| POST | `/api/files/move` | cookie | bulk move files into a folder |
| GET | `/api/files/[id]/url` | cookie | signed download URL |
| DELETE | `/api/files/[id]` | cookie | delete file + Cloudinary resource |
| GET / POST | `/api/folders` | cookie | list / create folders |
| PATCH / DELETE | `/api/folders/[id]` | cookie | rename / recursively delete a folder |
| POST | `/api/mail/send` | cookie | send mail via the Swoshmail API |

See [`docs/SWOSHMAIL-API.md`](docs/SWOSHMAIL-API.md) for the Swoshmail-side contract.

## Security notes

- All credentials are stored encrypted; passwords are one-way hashed. Logins are rate-limited/locked out.
- Files are uploaded with `access_mode: authenticated` — they can never be fetched with a plain Cloudinary URL; only signed, expiring links work.
- The secret passage is the only recovery mechanism. If it leaks, treat the account as compromised — there is no email-based reset.