import { NextResponse } from "next/server";
import { db, toUserRow } from "@/lib/db";
import {
  createSession,
  getLockoutMs,
  registerFailedAttempt,
  resetFailedAttempts,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const result = await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email] });
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    const user = toUserRow(result.rows[0] as Record<string, unknown>);

    const lockoutMs = getLockoutMs(user);
    if (lockoutMs > 0) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil(lockoutMs / 60000)} minutes.` },
        { status: 429 }
      );
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await registerFailedAttempt(user.id);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await resetFailedAttempts(user.id);
    const token = await createSession(user.id);

    const res = NextResponse.json({ success: true, email: user.email });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  } catch (error: unknown) {
    console.error("[swoshboard] login failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 500 }
    );
  }
}