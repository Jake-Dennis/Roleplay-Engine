import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, sanitizeFilename } from "@/lib/lore-markdown";
import { migrateCanonStatus, CANON_TIERS } from "@/lib/canon-tiers";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

function getUniverseOwnerId(db: any, universeId: string): string | null {
  const universe = db.prepare(
    `SELECT u.user_id, u.group_id, g.owner_id as group_owner_id
     FROM universes u
     LEFT JOIN groups g ON u.group_id = g.id
     WHERE u.id = ?`
  ).get(universeId);

  if (!universe) return null;
  if (universe.group_id) {
    return universe.group_owner_id;
  }
  return universe.user_id;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get("universe_id");
  const groupId = searchParams.get("group_id");

  const db = getDb();
  ensureGroupSupport(db);

  let npcs: any[];

  if (groupId) {
    if (!isGroupMember(db, groupId, decoded.sub)) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    npcs = db.prepare(
      `SELECT n.id, n.user_id, n.universe_id, n.name, n.file_path, n.canon_tier, n.canon_layer, n.location_id, n.importance, n.tags, n.created_at
       FROM npcs n
       WHERE n.universe_id IN (SELECT id FROM universes WHERE group_id = ?)
       ORDER BY n.created_at DESC`
    ).all(groupId);
  } else if (universeId) {
    npcs = db.prepare(
      `SELECT n.id, n.user_id, n.universe_id, n.name, n.file_path, n.canon_tier, n.canon_layer, n.location_id, n.importance, n.tags, n.created_at
       FROM npcs n
       WHERE n.universe_id = ?
       AND (n.user_id = ? OR n.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       ))
       ORDER BY n.created_at DESC`
    ).all(universeId, decoded.sub, decoded.sub);
  } else {
    npcs = db.prepare(
      `SELECT n.id, n.user_id, n.universe_id, n.name, n.file_path, n.canon_tier, n.canon_layer, n.location_id, n.importance, n.tags, n.created_at
       FROM npcs n
       WHERE n.user_id = ?
       OR n.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       )
       ORDER BY n.created_at DESC`
    ).all(decoded.sub, decoded.sub);
  }

  return NextResponse.json({ npcs });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { name, file_path, canon_tier = "generated_lore", canon_layer = "generated_lore", location_id, importance = "medium", tags, universe_id } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "NPC name is required" }, { status: 400 });
  }

  const validTier = CANON_TIERS.find(t => t.value === canon_tier)?.value || "generated_lore";

  const db = getDb();
  ensureGroupSupport(db);

  const id = crypto.randomUUID();
  const filename = file_path || sanitizeFilename(name.trim(), id);
  const tagsArray: string[] = tags || [];

  const fileOwnerId = universe_id ? getUniverseOwnerId(db, universe_id) : decoded.sub;

  const mdContent = buildMarkdown(
    {
      id,
      name: name.trim(),
      type: "npc",
      importance,
      canon_tier: validTier,
      tags: tagsArray,
      created_at: new Date().toISOString(),
    },
    `# ${name.trim()}\n\n## Description\n\n## Personality\n\n## History\n`
  );
  writeLoreFile(fileOwnerId || decoded.sub, "npcs", filename, mdContent);

  db.prepare(
    "INSERT INTO npcs (id, user_id, universe_id, name, file_path, canon_tier, canon_layer, location_id, importance, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    decoded.sub,
    universe_id || null,
    name.trim(),
    filename,
    validTier,
    canon_layer,
    location_id || null,
    importance,
    tags ? JSON.stringify(tags) : null
  );

  const npc = db
    .prepare(
      "SELECT id, user_id, universe_id, name, file_path, canon_tier, canon_layer, location_id, importance, tags, created_at FROM npcs WHERE id = ?"
    )
    .get(id);

  return NextResponse.json({ npc }, { status: 201 });
}
