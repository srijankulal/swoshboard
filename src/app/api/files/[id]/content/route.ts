import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCloudinaryConfigured, resolveSignedDownloadUrl } from "@/lib/cloudinary";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await context.params;

  const result = await db.execute({
    sql: "SELECT id, public_id, name, mime_type, size FROM files WHERE id = ? AND user_id = ?",
    args: [id, user.id],
  });
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const row = result.rows[0] as unknown as {
    id: string;
    public_id: string;
    name: string;
    mime_type: string;
    size: number;
  };

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: "Cloudinary credentials are not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const signedUrl = await resolveSignedDownloadUrl(row.public_id);
    const fetchRes = await fetch(signedUrl);
    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: `Could not retrieve file content (Storage returned ${fetchRes.status}).` },
        { status: fetchRes.status }
      );
    }
    const isPdf =
      row.mime_type === "application/pdf" ||
      row.name.toLowerCase().endsWith(".pdf");

    const arrayBuf = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    return NextResponse.json({
      success: true,
      file: {
        id: row.id,
        name: row.name,
        mime: row.mime_type,
        size: row.size,
        content: isPdf ? "" : buffer.toString("utf-8"),
        base64: isPdf ? buffer.toString("base64") : undefined,
        isPdf,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read file content." },
      { status: 500 }
    );
  }
}
