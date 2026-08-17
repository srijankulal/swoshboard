import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { encryptSecret, hashPassword, newId } from "@/lib/security";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const secret = String(body.secret || "").trim();
    const termsAccepted = Boolean(body.terms);

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long." }, { status: 400 });
    }
    if (secret.length < 3 || secret.length > 64) {
      return NextResponse.json(
        { error: "Secret passage must be 3-64 characters (a word, number, or phrase)." },
        { status: 400 }
      );
    }
    if (!termsAccepted) {
      return NextResponse.json({ error: "You must accept the Terms & Conditions." }, { status: 400 });
    }

    const existing = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const user = {
      id: newId("usr"),
      email,
      password_hash: await hashPassword(password),
      secret_passage: encryptSecret(secret),
      terms_accepted_at: new Date().toISOString(),
      created_at: Date.now(),
    } as const;
    await db.execute({
      sql: `INSERT INTO users (id, email, password_hash, secret_passage, terms_accepted_at, failed_attempts, locked_until, created_at)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
      args: [user.id, user.email, user.password_hash, user.secret_passage, user.terms_accepted_at, user.created_at],
    });

    const token = await createSession(user.id);
    const res = NextResponse.json({ success: true, email: user.email }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed." },
      { status: 500 }
    );
  }
}