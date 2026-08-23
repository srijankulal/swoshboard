# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Quick Reference

**Setup for local dev:** `npm install` → `.env` with stubs (Turso optional, Cloudinary/Swoshmail keys required) → `npm run dev` → http://localhost:3000. Local SQLite DB is auto-created at `file:./swoshboard.db`.

**Build & lint:** `npm run build` (typecheck + bundle), `npm run lint` (ESLint flat config).

## Key Design Patterns

- **Client/server split:** Pages (`src/app/{login,register,dashboard}`) are thin servers that redirect based on session; all UI logic lives in `*-client.tsx` components.
- **Direct uploads:** Files bypass the Node.js layer entirely—browser uploads to Cloudinary with signed params, then `POST /api/files` verifies the resource exists and quota is OK. This avoids the Vercel 4.5 MB body cap.
- **Folder structure as tree:** Folders are a simple parent-child model with no stored paths; recursive delete uses a CTE; folder creation happens on-demand during multi-file upload (`ensureFolderChain`).
- **Session state:** httpOnly cookies (`swosh_session`) backed by DB; 5 failed logins = 15 min lockout; secret passages are AES-256-GCM encrypted (changing `SWOSH_MASTER_KEY` breaks all resets).
- **Mail is external:** Swoshboard collects file IDs, fetches signed URLs from Cloudinary, then POSTs to `SWOSHMAIL_API_URL/api/send` with URLs. Swoshmail does the actual sending—never use Nodemailer.

## Critical Constraints

- **Max file size:** 10 MB per file (enforced in `/api/files/upload-sign` and `/api/files`); user quota is 200 MB by default (both env-configurable).
- **No `page.module.css`:** Styling is globals.css only (CSS variables, glassmorphism). No Tailwind or CSS-in-JS.
- **Cloudinary resource_type:** Always `"raw"` for files, never images.
- **libSQL casts:** Use `as unknown as X` not `as X` for Row values.
- **React Compiler enabled:** No `useMemo`/`useCallback` needed except for lint-rule deps.
- **Next.js 16 breaking changes:** `proxy.ts` (not `middleware.ts`), `await cookies()`, `const { id } = await params`. Check `node_modules/next/dist/docs/` for deprecations.

## File Organization

- `src/app/api/` — Auth, files (upload/move/delete), folders, mail endpoints.
- `src/lib/` — `db.ts` (Turso setup), `auth.ts` (session/crypto), `mail.ts` (Swoshmail client).
- `src/app/dashboard/` — `dashboard-client.tsx` is the main UI (state, uploads, selection, mail panel, modals).
- `instrumentation.ts` — DB schema init on server start.
- `next.config.ts` — `serverExternalPackages` includes `@libsql/client`.

## Environment & Deployment

**Local dev:** Uses `file:./swoshboard.db` by default; no `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` needed.

**Production (e.g., Vercel):** Must set a remote `TURSO_DATABASE_URL` (libSQL remote) + token, because Vercel has no persistent filesystem. Schema is created automatically on first server start via `instrumentation.ts`.

**Required env vars:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SWOSH_MASTER_KEY`, `SWOSHMAIL_API_URL`, `SWOSHMAIL_API_KEY`.

**Optional env vars:** `TURSO_DATABASE_URL` (default `file:./swoshboard.db`), `TURSO_AUTH_TOKEN`, `STORAGE_LIMIT_MB` (200), `SESSION_TTL_DAYS` (7), `MAX_FILE_MB` (10).

See README.md and AGENTS.md for full details.
