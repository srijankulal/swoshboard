import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteResource, isCloudinaryConfigured, signedDownloadUrl } from "@/lib/cloudinary";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await context.params;

  const result = await db.execute({
    sql: "SELECT public_id FROM files WHERE id = ? AND user_id = ?",
    args: [id, user.id],
  });
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const publicId = String((result.rows[0] as unknown as { public_id: unknown }).public_id);

  await db.execute({ sql: "DELETE FROM files WHERE id = ?", args: [id] });
  if (isCloudinaryConfigured()) {
    try {
      await deleteResource(publicId);
    } catch {
      // Orphan in Cloudinary only; DB row is already gone.
    }
  }

  return NextResponse.json({ success: true });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await context.params;

  const result = await db.execute({
    sql: "SELECT public_id, name FROM files WHERE id = ? AND user_id = ?",
    args: [id, user.id],
  });
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const row = result.rows[0] as unknown as { public_id: string; name: string };
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error: Cloudinary credentials are not set." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, url: signedDownloadUrl(row.public_id) });
}