import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, deleteLoreFile } from "@/lib/lore-markdown";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;

  const db = getDb();
  const location = db
    .prepare(
      "SELECT id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, created_at FROM locations WHERE id = ? AND user_id = ?"
    )
    .get(id, decoded.sub);

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  return NextResponse.json({ location });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM locations WHERE id = ? AND user_id = ?")
    .get(id, decoded.sub) as any;

  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const { name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, universe_id } = body;

  const newName = name || existing.name;
  const newFilePath = file_path || existing.file_path;

  // Update markdown file
  const mdContent = buildMarkdown(
    {
      id,
      name: newName,
      type: "location",
      importance: importance || existing.importance,
      parent_id: parent_location_id !== undefined ? parent_location_id : existing.parent_location_id,
      created_at: existing.created_at,
    },
    `# ${newName}\n\n${known_info ? `Known: ${typeof known_info === 'string' ? known_info : JSON.stringify(known_info)}` : existing.known_info ? `Known: ${JSON.stringify(existing.known_info)}` : ""}`
  );

  // If file path changed, delete old file
  if (newFilePath !== existing.file_path) {
    deleteLoreFile(decoded.sub, existing.file_path);
  }
  writeLoreFile(decoded.sub, "locations", newFilePath, mdContent);

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { updates.push("name = ?"); values.push(newName); }
  updates.push("file_path = ?"); values.push(newFilePath);
  if (importance !== undefined) { updates.push("importance = ?"); values.push(importance); }
  if (canon_layer !== undefined) { updates.push("canon_layer = ?"); values.push(canon_layer); }
  if (parent_location_id !== undefined) { updates.push("parent_location_id = ?"); values.push(parent_location_id); }
  if (known_info !== undefined) { updates.push("known_info = ?"); values.push(known_info ? JSON.stringify(known_info) : null); }
  if (hidden_info !== undefined) { updates.push("hidden_info = ?"); values.push(hidden_info ? JSON.stringify(hidden_info) : null); }
  if (universe_id !== undefined) { updates.push("universe_id = ?"); values.push(universe_id || null); }

  values.push(id);
  db.prepare(`UPDATE locations SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const location = db
    .prepare(
      "SELECT id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, created_at FROM locations WHERE id = ?"
    )
    .get(id);

  return NextResponse.json({ location });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;

  const db = getDb();

  const existing = db
    .prepare("SELECT file_path FROM locations WHERE id = ? AND user_id = ?")
    .get(id, decoded.sub) as { file_path: string } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  // Delete markdown file
  deleteLoreFile(decoded.sub, existing.file_path);

  db.prepare("DELETE FROM locations WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
