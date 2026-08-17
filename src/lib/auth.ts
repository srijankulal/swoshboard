import { cookies } from "next/headers";
import { db, toUserRow, type UserRow } from "./db";
import { newSessionToken } from "./security";

export const SESSION_COOKIE = "swosh_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

export async function createSession(userId: string): Promise<string> {
  const token = newSessionToken();
  const now = Date.now();
  await db.execute({
    sql: "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    args: [token, userId, now, now + SESSION_TTL_SECONDS * 1000],
  });
  return token;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.execute({ sql: "DELETE FROM sessions WHERE token = ?", args: [token] });
}

export async function getSessionUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await db.execute({
    sql: `
      SELECT u.* FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?
    `,
    args: [token, Date.now()],
  });
  if (result.rows.length === 0) return null;
  return toUserRow(result.rows[0] as Record<string, unknown>);
}

export function registerFailedAttempt(userId: string): Promise<unknown> {
  return db.execute({
    sql: `
      UPDATE users
      SET failed_attempts = failed_attempts + 1,
          locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END
      WHERE id = ?
    `,
    args: [MAX_ATTEMPTS, Date.now() + LOCKOUT_MS, userId],
  });
}

export function resetFailedAttempts(userId: string): Promise<unknown> {
  return db.execute({
    sql: "UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?",
    args: [userId],
  });
}

export function getLockoutMs(user: UserRow): number {
  return Math.max(0, user.locked_until - Date.now());
}