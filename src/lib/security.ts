import crypto from "crypto";
import bcrypt from "bcryptjs";

const ALGORITHM = "aes-256-gcm";

function masterKey(): Buffer {
  const raw = process.env.SWOSH_MASTER_KEY;
  if (!raw) {
    throw new Error("SWOSH_MASTER_KEY env var is not set");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || !data) {
    throw new Error("Malformed secret passage");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8"
  );
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}