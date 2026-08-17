import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, getUsage, MAX_FILE_SIZE_BYTES, STORAGE_LIMIT_BYTES } from "@/lib/db";
import { isCloudinaryConfigured, signUpload } from "@/lib/cloudinary";
import { slugify } from "@/lib/security";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error: Cloudinary credentials are not set." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const size = Number(body.size);
    const folderId = body.folderId ? String(body.folderId) : null;

    if (!name) {
      return NextResponse.json({ error: "File name is required." }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `"${name}" exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB per-file limit.` },
        { status: 413 }
      );
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

    const { usedBytes } = await getUsage(user.id);
    if (usedBytes + size > STORAGE_LIMIT_BYTES) {
      return NextResponse.json(
        {
          error: "Storage limit exceeded.",
          usedBytes,
          limitBytes: STORAGE_LIMIT_BYTES,
        },
        { status: 403 }
      );
    }

    const safeName = slugify(name) || "file";
    return NextResponse.json({ success: true, upload: signUpload(user.id, safeName) });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare upload." },
      { status: 500 }
    );
  }
}