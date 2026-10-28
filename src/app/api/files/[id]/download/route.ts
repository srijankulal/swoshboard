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
      { error: "Server configuration error: Cloudinary credentials are not set." },
      { status: 500 }
    );
  }

  try {
    const signedUrl = await resolveSignedDownloadUrl(row.public_id);
    const upstreamRes = await fetch(signedUrl);

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { error: `Storage download failed (${upstreamRes.status}).` },
        { status: upstreamRes.status }
      );
    }

    const safeName = row.name || "download";
    const encodedName = encodeURIComponent(safeName);

    const headers = new Headers();
    headers.set("Content-Type", row.mime_type || "application/octet-stream");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`
    );
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstreamRes.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete download." },
      { status: 500 }
    );
  }
}
