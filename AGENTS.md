<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Swoshboard

Personal backup dashboard: per-user accounts, 200 MB Cloudinary storage, and a Quick Mail panel whose emails are ALWAYS sent by the external Swoshmail service (`src/lib/mail.ts` + `POST /api/mail/send`). Swoshboard never sends mail itself — do not add Nodemailer back.

## Commands

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint` — eslint (flat config, `eslint.config.mjs`)
- No tests exist. `npm run build` is the only typecheck — there is no `tsc` script.

## Architecture

- **Auth**: `src/app/api/auth/{register,login,logout,reset,me}` — bcrypt-hashed passwords, secret passage (password-recovery word/number) AES-256-GCM encrypted with `SWOSH_MASTER_KEY`, httpOnly cookie sessions (`swosh_session`, DB-backed in `sessions` table, 5-attempt lockout). Client pages: `src/app/login`, `src/app/register`, `src/app/terms`.
- **Pages are thin**: server pages (`/login`, `/register`, `/dashboard`) only check the session via `getSessionUser()` and redirect; the dashboard UI lives in `src/app/dashboard/dashboard-client.tsx`.
- **Storage**: browser uploads go DIRECTLY to Cloudinary (signed params from `POST /api/files/upload-sign`), then `POST /api/files` registers the file + re-verifies quota against Cloudinary metadata (`getResourceBytes`). Files use `access_mode: authenticated`; downloads are signed, expiring URLs. Per-file cap `MAX_FILE_MB` (10 MB default) enforced in both routes. This must stay — server-relaying files would hit the Vercel 4.5 MB body cap.
- **Folders**: `folders` table (parent-child tree, no paths stored); `files.folder_id` migrated in `initDb()` via a lenient `ALTER TABLE` (existing DBs gain the column on next server start — restart after pulling). Folder creation/rename/delete is `src/app/api/folders`; delete is recursive (recursive CTE) and batches Cloudinary `delete_resources` in chunks of 50; bulk moving is `POST /api/files/move`.
- **Databases**: Turso (libSQL) via `src/lib/db.ts` — `users`, `sessions`, `folders`, `files`. Local dev defaults to `file:./swoshboard.db` (auto-created). Schema init runs once per server start in `instrumentation.ts` (`register()`). `@libsql/client` is in `serverExternalPackages` in `next.config.ts`.
- **Mail**: `src/app/api/mail/send` resolves owned file IDs → signed Cloudinary URLs → `src/lib/mail.ts` calls `{SWOSHMAIL_API_URL}/api/send` with a Bearer `SWOSHMAIL_API_KEY`. API contract: `docs/SWOSHMAIL-API.md`.

## Environment variables (server-side only)

Required: `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, `SWOSH_MASTER_KEY`, `SWOSHMAIL_API_URL`/`SWOSHMAIL_API_KEY`. Optional: `TURSO_DATABASE_URL` (default `file:./swoshboard.db`), `TURSO_AUTH_TOKEN`, `STORAGE_LIMIT_MB` (200), `SESSION_TTL_DAYS` (7).

- `.env` is gitignored, contains stub values; there is no `.env.example`. Notes: changing `SWOSH_MASTER_KEY` breaks resets for existing users; Cloudinary free tier (~25 GB) is per account, all files share the `swoshboard/` folder prefix.

## Conventions

- Next.js 16 specifics already applied in this repo (do not regress): `middleware.ts` is dead — it is `proxy.ts` now; `cookies()` from `next/headers` is async (`await cookies()`); dynamic route `params` is a Promise (`const { id } = await params`).
- React Compiler is enabled (`reactCompiler: true`) — no `useMemo`/`useCallback` needed except to satisfy the `react-hooks/exhaustive-deps` lint rule for effect deps.
- Styling: hand-rolled plain CSS in `src/app/globals.css` (CSS variables + glassmorphism; `page.module.css` was deleted — keep using globals classes). No Tailwind, no CSS-in-JS.
- `@libsql/client` row values come back as `Row` — cast through `as unknown as X`, not a direct `as X`.
- Cloudinary uploads are `resource_type: "raw"`; never upload as images.