import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSwoshmailConfig, sendViaSwoshmail } from "@/lib/mail";
import { signedDownloadUrl } from "@/lib/cloudinary";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const config = getSwoshmailConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Mail service is not configured (SWOSHMAIL_API_URL / SWOSHMAIL_API_KEY)." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const to = String(body.to || "").trim();
    const subject = String(body.subject || "").trim();
    const text = String(body.text || "").trim();
    const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds.map(String) : [];

    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: "Please provide a valid recipient email." }, { status: 400 });
    }

    let attachments: { url: string; filename: string; mime: string }[] = [];
    if (fileIds.length > 0) {
      const placeholders = fileIds.map(() => "?").join(",");
      const result = await db.execute({
        sql: `SELECT public_id, name, mime_type FROM files WHERE user_id = ? AND id IN (${placeholders})`,
        args: [user.id, ...fileIds],
      });
      const rows = result.rows as unknown as { public_id: string; name: string; mime_type: string }[];
      attachments = rows.map((row) => ({
        url: signedDownloadUrl(row.public_id),
        filename: row.name,
        mime: row.mime_type,
      }));
    }

    const result = await sendViaSwoshmail(config, {
      to,
      subject: subject || `Swoshboard: ${attachments.length > 0 ? `${attachments.length} file(s)` : "message"}`,
      text: text || "Sent from your Swoshboard personal dashboard.",
      attachments,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message:
        attachments.length > 0
          ? `Mail sent with ${attachments.length} attachment(s).`
          : "Mail sent.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send mail." },
      { status: 500 }
    );
  }
}