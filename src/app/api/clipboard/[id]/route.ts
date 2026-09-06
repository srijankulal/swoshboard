import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const result = await db.execute({
      sql: "DELETE FROM clipboard_clips WHERE id = ? AND user_id = ?",
      args: [id, user.id],
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "Clip not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete clip." },
      { status: 500 }
    );
  }
}
