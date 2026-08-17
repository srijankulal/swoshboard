import { NextResponse } from "next/server";
import { db, toUserRow } from "@/lib/db";
import { decryptSecret, hashPassword } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const secret = String(body.secret || "").trim();
    const newPassword = String(body.newPassword || "");

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters long." }, { status: 400 });
    }

    const result = await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email] });
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "No account found for this email." }, { status: 404 });
    }
    const user = toUserRow(result.rows[0] as Record<string, unknown>);

    let savedSecret: string;
    try {
      savedSecret = decryptSecret(user.secret_passage);
    } catch {
      return NextResponse.json({ error: "Could not verify secret passage." }, { status: 500 });
    }

    if (savedSecret !== secret) {
      return NextResponse.json({ error: "Secret passage does not match." }, { status: 403 });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = 0 WHERE id = ?",
      args: [passwordHash, user.id],
    });
    await db.execute({ sql: "DELETE FROM sessions WHERE user_id = ?", args: [user.id] });

    return NextResponse.json({ success: true, message: "Password reset. Please log in with your new password." });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Password reset failed." },
      { status: 500 }
    );
  }
}