import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, deleteLoreFile } from "@/lib/lore-markdown";
import { CANON_TIERS } from "@/lib/canon-tiers";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

function hasEntityAccess(db: any, entityType: string, entityId: string, userId: string): any {
  let entity: any = null;
  if (entityType === "npcs") {
    entity = db.prepare(
      `SELECT n.*, u.group_id, g.owner_id as group_owner_id
       FROM npcs n
       LEFT JOIN universes u ON n.universe_id = u.id
       LEFT JOIN groups g ON u.group_id = g.id
       WHERE n.id = ?`
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
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  const npc = hasEntityAccess(db, "npcs", id, decoded.sub);
  if (!npc) return NextResponse.json({ error: "NPC not found" }, { status: 404 });

  return NextResponse.json({ npc });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const db = getDb();
  ensureGroupSupport(db);

  const existing = hasEntityAccess(db, "npcs", id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "NPC not found" }, { status: 404 });

  const { name, file_path, canon_tier, canon_layer, location_id, importance, tags } = body;
  const newName = name || existing.name;
  const newFilePath = file_path || existing.file_path;
  const newTags = tags || (existing.tags ? JSON.parse(existing.tags) : []);

  // D2: Immutable canon enforcement - prevent edits to immutable_canon tier
  if (existing.canon_tier === "immutable_canon") {
    return NextResponse.json(
      { error: "Cannot edit immutable canon entities. Create a new entity instead." },
      { status: 403 }
    );
  }

  // Validate canon_tier if provided
  const validTier = canon_tier
    ? CANON_TIERS.find(t => t.value === canon_tier)?.value || existing.canon_tier
    : existing.canon_tier;

  // Update markdown file - use group owner's directory for group universes
  const fileOwnerId = getFileOwnerId(existing, decoded.sub);
  const mdContent = buildMarkdown(
    { id, name: newName, type: "npc", importance: importance || existing.importance, canon_tier: validTier, tags: newTags, created_at: existing.created_at },
    `# ${newName}\n\n## Description\n\n## Personality\n\n## History\n`
  );
  if (newFilePath !== existing.file_path) deleteLoreFile(fileOwnerId, existing.file_path);
  writeLoreFile(fileOwnerId, "npcs", newFilePath, mdContent);

  db.prepare(
    "UPDATE npcs SET name = COALESCE(?, name), file_path = ?, canon_tier = COALESCE(?, canon_tier), canon_layer = COALESCE(?, canon_layer), location_id = COALESCE(?, location_id), importance = COALESCE(?, importance), tags = COALESCE(?, tags) WHERE id = ?"
  ).run(newName, newFilePath, canon_tier || null, canon_layer || null, location_id !== undefined ? location_id : null, importance || null, tags ? JSON.stringify(tags) : null, id);

  const npc = db.prepare("SELECT id, user_id, name, file_path, canon_tier, canon_layer, location_id, importance, tags, created_at FROM npcs WHERE id = ?").get(id);
  return NextResponse.json({ npc });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  const existing = hasEntityAccess(db, "npcs", id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "NPC not found" }, { status: 404 });

  const fileOwnerId = getFileOwnerId(existing, decoded.sub);
  deleteLoreFile(fileOwnerId, existing.file_path);
  db.prepare("DELETE FROM npcs WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
