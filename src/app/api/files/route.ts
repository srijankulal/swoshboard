import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  db,
  getUsage,
  MAX_FILE_SIZE_BYTES,
  STORAGE_LIMIT_BYTES,
  toFileRow,
  type FileRow,
} from "@/lib/db";
import { getResourceBytes } from "@/lib/cloudinary";
import { newId } from "@/lib/security";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await db.execute({
    sql: "SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC",
    args: [user.id],
  });
  const files: FileRow[] = result.rows.map((row) => toFileRow(row as Record<string, unknown>));
  const { usedBytes, fileCount } = await getUsage(user.id);

  return NextResponse.json({
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      mime: f.mime_type,
      size: f.size,
      folderId: f.folder_id,
      createdAt: f.created_at,
    })),
    usage: { usedBytes, limitBytes: STORAGE_LIMIT_BYTES, fileCount },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const publicId = String(body.publicId || "");
    const name = String(body.name || "").trim();
    const mime = String(body.mime || "application/octet-stream");
    const reportedSize = Number(body.size);
    const folderId = body.folderId ? String(body.folderId) : null;

    if (!publicId || !name) {
      return NextResponse.json({ error: "Missing upload details." }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM files WHERE public_id = ?",
      args: [publicId],
    });
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "File already registered." }, { status: 409 });
    }

    if (folderId) {
      const folder = await db.execute({
        sql: "SELECT id FROM folders WHERE id = ? AND user_id = ?",
        args: [folderId, user.id],
      });
      if (folder.rows.length === 0) {
        return NextResponse.json({ error: "Target folder not found." }, { status: 404 });
      }
    }

    const actualSize = await getResourceBytes(publicId);
    if (actualSize <= 0) {
      return NextResponse.json({ error: "Uploaded file not found in storage." }, { status: 422 });
    }
    if (Number.isFinite(reportedSize) && actualSize !== reportedSize) {
      return NextResponse.json({ error: "Uploaded size does not match." }, { status: 422 });
    }
    if (actualSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `"${name}" exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB per-file limit.` },
        { status: 413 }
      );
    }

    const { usedBytes } = await getUsage(user.id);
    if (usedBytes + actualSize > STORAGE_LIMIT_BYTES) {
      return NextResponse.json(
        { error: "Storage limit exceeded.", usedBytes, limitBytes: STORAGE_LIMIT_BYTES },
        { status: 403 }
      );
    }

    const file: FileRow = {
      id: newId("fil"),
      user_id: user.id,
      public_id: publicId,
      name,
      mime_type: mime,
      size: actualSize,
      folder_id: folderId,
      created_at: Date.now(),
    };
    await db.execute({
      sql: "INSERT INTO files (id, user_id, public_id, name, mime_type, size, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [file.id, file.user_id, file.public_id, file.name, file.mime_type, file.size, file.folder_id, file.created_at],
    });

    return NextResponse.json(
      {
        success: true,
        file: {
          id: file.id,
          name: file.name,
          mime: file.mime_type,
          size: file.size,
          folderId: file.folder_id,
          createdAt: file.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not register file." },
      { status: 500 }
    );
  }
}