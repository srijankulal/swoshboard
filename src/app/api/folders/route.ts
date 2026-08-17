import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, toFolderRow, type FolderRow } from "@/lib/db";
import { newId } from "@/lib/security";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await db.execute({
    sql: "SELECT * FROM folders WHERE user_id = ? ORDER BY name COLLATE NOCASE",
    args: [user.id],
  });
  const folders: FolderRow[] = result.rows.map((row) => toFolderRow(row as Record<string, unknown>));

  return NextResponse.json({
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parent_id,
      createdAt: f.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const parentId = body.parentId ? String(body.parentId) : null;

    if (!name || name.length > 100) {
      return NextResponse.json({ error: "Folder name must be 1-100 characters." }, { status: 400 });
    }

    if (parentId) {
      const parent = await db.execute({
        sql: "SELECT id FROM folders WHERE id = ? AND user_id = ?",
        args: [parentId, user.id],
      });
      if (parent.rows.length === 0) {
        return NextResponse.json({ error: "Parent folder not found." }, { status: 404 });
      }
    }

    const dup = await db.execute({
      sql: "SELECT id FROM folders WHERE user_id = ? AND parent_id IS ? AND name = ? COLLATE NOCASE",
      args: [user.id, parentId, name],
    });
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "A folder with this name already exists here." }, { status: 409 });
    }

    const folder: FolderRow = {
      id: newId("fld"),
      user_id: user.id,
      name,
      parent_id: parentId,
      created_at: Date.now(),
    };
    await db.execute({
      sql: "INSERT INTO folders (id, user_id, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [folder.id, folder.user_id, folder.name, folder.parent_id, folder.created_at],
    });

    return NextResponse.json(
      {
        success: true,
        folder: { id: folder.id, name: folder.name, parentId: folder.parent_id, createdAt: folder.created_at },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create folder." },
      { status: 500 }
    );
  }
}