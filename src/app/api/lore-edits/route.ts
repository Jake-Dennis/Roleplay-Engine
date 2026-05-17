import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const db = getDb();

  const edits = db.prepare(
    "SELECT id, user_id, old_content, new_content, edited_at, edit_summary FROM lore_edits WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY edited_at DESC LIMIT 50"
  ).all(decoded.sub, entityType, entityId) as {
    id: string;
    user_id: string;
    old_content: string | null;
    new_content: string | null;
    edited_at: string;
    edit_summary: string | null;
  }[];

  // Enrich with usernames
  const enrichedEdits = edits.map((edit) => {
    const user = db.prepare(
      "SELECT username FROM users WHERE id = ?"
    ).get(edit.user_id) as { username: string } | undefined;
    return {
      id: edit.id,
      userId: edit.user_id,
      username: user?.username || "Unknown",
      oldContent: edit.old_content,
      newContent: edit.new_content,
      editedAt: edit.edited_at,
      editSummary: edit.edit_summary,
    };
  });

  return NextResponse.json({ edits: enrichedEdits });
}
