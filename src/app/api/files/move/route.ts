import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds.map(String).filter(Boolean) : [];
    const folderId = body.folderId ? String(body.folderId) : null;

    if (fileIds.length === 0) {
      return NextResponse.json({ error: "No files selected." }, { status: 400 });
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

    const placeholders = fileIds.map(() => "?").join(",");
    const owned = await db.execute({
      sql: `SELECT id FROM files WHERE user_id = ? AND id IN (${placeholders})`,
      args: [user.id, ...fileIds],
    });
    if (owned.rows.length !== fileIds.length) {
      return NextResponse.json({ error: "One or more files were not found." }, { status: 404 });
    }

    await db.execute({
      sql: `UPDATE files SET folder_id = ? WHERE user_id = ? AND id IN (${placeholders})`,
      args: [folderId, user.id, ...fileIds],
    });

    return NextResponse.json({ success: true, moved: fileIds.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not move files." },
      { status: 500 }
    );
  }
}