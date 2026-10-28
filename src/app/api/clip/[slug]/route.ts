import { NextResponse } from "next/server";
import { db, initDb, type GlobalClipRow } from "@/lib/db";

const MAX_CLIP_CONTENT = 200_000;

function cleanSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  await initDb();
  const { slug: rawSlug } = await context.params;
  const slug = cleanSlug(rawSlug);

  if (!slug) {
    return NextResponse.json({ error: "Invalid clip name." }, { status: 400 });
  }

  try {
    const res = await db.execute({
      sql: "SELECT * FROM global_clips WHERE slug = ?",
      args: [slug],
    });

    if (res.rows.length === 0) {
      return NextResponse.json({
        success: true,
        found: false,
        slug,
      });
    }

    const row = res.rows[0] as unknown as GlobalClipRow;
    const now = Date.now();

    // Check expiration
    if (row.expires_at && row.expires_at < now) {
      await db.execute({
        sql: "DELETE FROM global_clips WHERE slug = ?",
        args: [slug],
      });
      return NextResponse.json({
        success: true,
        found: false,
        slug,
        message: "Clip has expired.",
      });
    }

    // Handle burn after reading
    if (row.burn_after_reading) {
      await db.execute({
        sql: "DELETE FROM global_clips WHERE slug = ?",
        args: [slug],
      });
    } else {
      // Increment view count
      await db.execute({
        sql: "UPDATE global_clips SET views = views + 1 WHERE slug = ?",
        args: [slug],
      });
    }

    return NextResponse.json({
      success: true,
      found: true,
      clip: {
        slug: row.slug,
        title: row.title || "",
        content: row.content,
        format: row.format || "text",
        isLocked: Boolean(row.is_locked),
        views: (row.views || 0) + 1,
        burnAfterReading: Boolean(row.burn_after_reading),
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load clip." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  return handleSaveClip(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  return handleSaveClip(request, context);
}

async function handleSaveClip(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  await initDb();
  const { slug: rawSlug } = await context.params;
  const slug = cleanSlug(rawSlug);

  if (!slug) {
    return NextResponse.json({ error: "Invalid clip name." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const content = typeof body.content === "string" ? body.content : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : null;
    const format = typeof body.format === "string" ? body.format.slice(0, 20) : "text";
    const isLocked = body.isLocked ? 1 : 0;
    const burnAfterReading = body.burnAfterReading ? 1 : 0;
    const expiryHours = Number(body.expiryHours);

    if (content.length > MAX_CLIP_CONTENT) {
      return NextResponse.json(
        { error: `Clip content exceeds the limit of ${MAX_CLIP_CONTENT.toLocaleString()} characters.` },
        { status: 400 }
      );
    }

    const now = Date.now();
    let expiresAt: number | null = null;
    if (Number.isFinite(expiryHours) && expiryHours > 0) {
      expiresAt = now + Math.round(expiryHours * 3600 * 1000);
    }

    // Check if existing clip is locked
    const existing = await db.execute({
      sql: "SELECT is_locked FROM global_clips WHERE slug = ?",
      args: [slug],
    });

    if (existing.rows.length > 0) {
      const existingRow = existing.rows[0] as unknown as { is_locked: number };
      if (existingRow.is_locked && !body.unlock) {
        return NextResponse.json(
          { error: "This clip is locked and cannot be edited." },
          { status: 403 }
        );
      }
    }

    await db.execute({
      sql: `
        INSERT INTO global_clips (
          slug, title, content, format, is_locked, views, burn_after_reading, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          title = excluded.title,
          content = excluded.content,
          format = excluded.format,
          is_locked = excluded.is_locked,
          burn_after_reading = excluded.burn_after_reading,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `,
      args: [
        slug,
        title,
        content,
        format,
        isLocked,
        burnAfterReading,
        expiresAt,
        now,
        now,
      ],
    });

    return NextResponse.json({
      success: true,
      clip: {
        slug,
        title: title || "",
        content,
        format,
        isLocked: Boolean(isLocked),
        burnAfterReading: Boolean(burnAfterReading),
        expiresAt,
        updatedAt: now,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save clip." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  await initDb();
  const { slug: rawSlug } = await context.params;
  const slug = cleanSlug(rawSlug);

  if (!slug) {
    return NextResponse.json({ error: "Invalid clip name." }, { status: 400 });
  }

  try {
    const existing = await db.execute({
      sql: "SELECT is_locked FROM global_clips WHERE slug = ?",
      args: [slug],
    });

    if (existing.rows.length > 0) {
      const existingRow = existing.rows[0] as unknown as { is_locked: number };
      if (existingRow.is_locked) {
        return NextResponse.json(
          { error: "Cannot delete a locked clip." },
          { status: 403 }
        );
      }
    }

    await db.execute({
      sql: "DELETE FROM global_clips WHERE slug = ?",
      args: [slug],
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete clip." },
      { status: 500 }
    );
  }
}
