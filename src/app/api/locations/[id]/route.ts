import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, deleteLoreFile } from "@/lib/lore-markdown";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

function hasEntityAccess(db: any, entityType: string, entityId: string, userId: string): any {
  let entity: any = null;
  if (entityType === "locations") {
    entity = db.prepare(
      `SELECT l.*, u.group_id, g.owner_id as group_owner_id
       FROM locations l
       LEFT JOIN universes u ON l.universe_id = u.id
       LEFT JOIN groups g ON u.group_id = g.id
       WHERE l.id = ?`
    ).get(entityId);
  }

  if (!entity) return null;

  // Direct ownership
  if (entity.user_id === userId) return entity;

  // Group membership
  if (entity.group_id && isGroupMember(db, entity.group_id, userId)) return entity;

  return null;
}

function getFileOwnerId(entity: any, fallbackUserId: string): string {
  if (entity.group_id && entity.group_owner_id) return entity.group_owner_id;
  return fallbackUserId;
}

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
  ensureGroupSupport(db);

  const location = hasEntityAccess(db, "locations", id, decoded.sub);
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
  ensureGroupSupport(db);

  const existing = hasEntityAccess(db, "locations", id, decoded.sub);
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const { name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, universe_id } = body;

  const newName = name || existing.name;
  const newFilePath = file_path || existing.file_path;

  // Update markdown file - use group owner's directory for group universes
  const fileOwnerId = getFileOwnerId(existing, decoded.sub);
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
    deleteLoreFile(fileOwnerId, existing.file_path);
  }
  writeLoreFile(fileOwnerId, "locations", newFilePath, mdContent);

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
  ensureGroupSupport(db);

  const existing = hasEntityAccess(db, "locations", id, decoded.sub);
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  // Delete markdown file - use group owner's directory for group universes
  const fileOwnerId = getFileOwnerId(existing, decoded.sub);
  deleteLoreFile(fileOwnerId, existing.file_path);

  db.prepare("DELETE FROM locations WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
