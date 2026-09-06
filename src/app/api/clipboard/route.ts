import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, type ClipboardClipRow } from "@/lib/db";
import { newId } from "@/lib/security";

const MAX_CLIPBOARD_TEXT_LENGTH = 100_000;

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const scratchpadRes = await db.execute({
      sql: "SELECT content, updated_at FROM clipboard_scratchpad WHERE user_id = ?",
      args: [user.id],
    });
    const scratchpadRow = scratchpadRes.rows[0] as unknown as
      | { content: string; updated_at: number }
      | undefined;

    const clipsRes = await db.execute({
      sql: "SELECT id, user_id, title, content, created_at FROM clipboard_clips WHERE user_id = ? ORDER BY created_at DESC",
      args: [user.id],
    });
    const clips = (clipsRes.rows as unknown as ClipboardClipRow[]).map((clip) => ({
      id: clip.id,
      title: clip.title || null,
      content: clip.content,
      createdAt: clip.created_at,
    }));

    return NextResponse.json({
      scratchpad: scratchpadRow?.content ?? "",
      updatedAt: scratchpadRow?.updated_at ?? 0,
      clips,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch clipboard." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const content = typeof body.content === "string" ? body.content : "";

    if (content.length > MAX_CLIPBOARD_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Scratchpad content exceeds maximum limit of ${MAX_CLIPBOARD_TEXT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const now = Date.now();
    await db.execute({
      sql: `
        INSERT INTO clipboard_scratchpad (user_id, content, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          content = excluded.content,
          updated_at = excluded.updated_at
      `,
      args: [user.id, content, now],
    });

    return NextResponse.json({ success: true, updatedAt: now });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update scratchpad." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const content = String(body.content || "").trim();
    const title = body.title ? String(body.title).trim().slice(0, 120) : null;

    if (!content) {
      return NextResponse.json({ error: "Clip content cannot be empty." }, { status: 400 });
    }

    if (content.length > MAX_CLIPBOARD_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Clip exceeds maximum limit of ${MAX_CLIPBOARD_TEXT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const id = newId("clp");
    const now = Date.now();

    await db.execute({
      sql: "INSERT INTO clipboard_clips (id, user_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, user.id, title, content, now],
    });

    return NextResponse.json(
      {
        success: true,
        clip: {
          id,
          title,
          content,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create clip." },
      { status: 500 }
    );
  }
}
