import { createClient } from "@libsql/client";

export const STORAGE_LIMIT_BYTES =
  (Number(process.env.STORAGE_LIMIT_MB || 200) || 200) * 1024 * 1024;

export const MAX_FILE_SIZE_BYTES =
  (Number(process.env.MAX_FILE_MB || 10) || 10) * 1024 * 1024;

const dbUrl = process.env.TURSO_DATABASE_URL || "file:./swoshboard.db";

export const db = createClient({
  url: dbUrl,
  ...(dbUrl.startsWith("file:") || process.env.TURSO_AUTH_TOKEN
    ? {}
    : { authToken: process.env.TURSO_AUTH_TOKEN }),
});

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  secret_passage: string;
  terms_accepted_at: string;
  failed_attempts: number;
  locked_until: number;
  created_at: number;
}

export interface FileRow {
  id: string;
  user_id: string;
  public_id: string;
  name: string;
  mime_type: string;
  size: number;
  folder_id: string | null;
  created_at: number;
}

export interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

export async function initDb(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      secret_passage TEXT NOT NULL,
      terms_accepted_at TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    )
  `);
  try {
    await db.execute(
      "ALTER TABLE files ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE"
    );
  } catch {
    // column already exists (fresh or already-migrated database)
  }
}

export function toUserRow(row: Record<string, unknown>): UserRow {
  return row as unknown as UserRow;
}

export function toFileRow(row: Record<string, unknown>): FileRow {
  return row as unknown as FileRow;
}

export function toFolderRow(row: Record<string, unknown>): FolderRow {
  return row as unknown as FolderRow;
}

export async function getUsage(userId: string): Promise<{ usedBytes: number; fileCount: number }> {
  const result = await db.execute({
    sql: "SELECT COALESCE(SUM(size), 0) AS used, COUNT(*) AS count FROM files WHERE user_id = ?",
    args: [userId],
  });
  const row = result.rows[0] as unknown as { used: number; count: number };
  return { usedBytes: Number(row.used), fileCount: Number(row.count) };
}