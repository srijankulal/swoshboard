import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteResource, isCloudinaryConfigured } from "@/lib/cloudinary";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await context.params;

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();

    if (!name || name.length > 100) {
      return NextResponse.json({ error: "Folder name must be 1-100 characters." }, { status: 400 });
    }

    const folder = await db.execute({
      sql: "SELECT parent_id FROM folders WHERE id = ? AND user_id = ?",
      args: [id, user.id],
    });
    if (folder.rows.length === 0) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }
    const parentId = (folder.rows[0] as unknown as { parent_id: string | null }).parent_id;

    const dup = await db.execute({
      sql: "SELECT id FROM folders WHERE user_id = ? AND parent_id IS ? AND name = ? COLLATE NOCASE AND id != ?",
      args: [user.id, parentId, name, id],
    });
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "A folder with this name already exists here." }, { status: 409 });
    }

    await db.execute({ sql: "UPDATE folders SET name = ? WHERE id = ?", args: [name, id] });
    return NextResponse.json({ success: true, name });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not rename folder." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await context.params;

  const owner = await db.execute({
    sql: "SELECT id FROM folders WHERE id = ? AND user_id = ?",
    args: [id, user.id],
  });
  if (owner.rows.length === 0) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }

  const subtree = await db.execute({
    sql: `
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM folders WHERE id = ? AND user_id = ?
        UNION ALL
        SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
      )
      SELECT id FROM subtree
    `,
    args: [id, user.id],
  });
  const folderIds = subtree.rows.map((row) => String((row as unknown as { id: string }).id));

  const fileRes = await db.execute({
    sql: `SELECT public_id FROM files WHERE user_id = ? AND folder_id IN (${folderIds.map(() => "?").join(",")})`,
    args: [user.id, ...folderIds],
  });
  const publicIds = fileRes.rows.map((row) => String((row as unknown as { public_id: string }).public_id));

  await db.execute({
    sql: `DELETE FROM files WHERE user_id = ? AND folder_id IN (${folderIds.map(() => "?").join(",")})`,
    args: [user.id, ...folderIds],
  });
  await db.execute({
    sql: `DELETE FROM folders WHERE id IN (${folderIds.map(() => "?").join(",")})`,
    args: folderIds,
  });

  if (isCloudinaryConfigured() && publicIds.length > 0) {
    for (let i = 0; i < publicIds.length; i += 50) {
      try {
        await deleteResource(publicIds.slice(i, i + 50));
      } catch {
        // orphans only; DB rows are already gone
      }
    }
  }

  return NextResponse.json({ success: true, deletedFolders: folderIds.length, deletedFiles: publicIds.length });
}