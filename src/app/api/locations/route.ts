import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, sanitizeFilename } from "@/lib/lore-markdown";
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

  let locations: any[];

  if (groupId) {
    if (!isGroupMember(db, groupId, decoded.sub)) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    locations = db.prepare(
      `SELECT l.id, l.user_id, l.universe_id, l.name, l.file_path, l.importance, l.canon_layer, l.parent_location_id, l.known_info, l.hidden_info, l.created_at
       FROM locations l
       WHERE l.universe_id IN (SELECT id FROM universes WHERE group_id = ?)
       ORDER BY l.created_at DESC`
    ).all(groupId);
  } else if (universeId) {
    locations = db.prepare(
      `SELECT l.id, l.user_id, l.universe_id, l.name, l.file_path, l.importance, l.canon_layer, l.parent_location_id, l.known_info, l.hidden_info, l.created_at
       FROM locations l
       WHERE l.universe_id = ?
       AND (l.user_id = ? OR l.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       ))
       ORDER BY l.created_at DESC`
    ).all(universeId, decoded.sub, decoded.sub);
  } else {
    locations = db.prepare(
      `SELECT l.id, l.user_id, l.universe_id, l.name, l.file_path, l.importance, l.canon_layer, l.parent_location_id, l.known_info, l.hidden_info, l.created_at
       FROM locations l
       WHERE l.user_id = ?
       OR l.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       )
       ORDER BY l.created_at DESC`
    ).all(decoded.sub, decoded.sub);
  }

  return NextResponse.json({ locations });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { name, file_path, importance = "medium", canon_layer = "generated_lore", parent_location_id, known_info, hidden_info, universe_id } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }

  const db = getDb();
  ensureGroupSupport(db);

  const id = crypto.randomUUID();
  const filename = file_path || sanitizeFilename(name.trim(), id);

  const fileOwnerId = universe_id ? getUniverseOwnerId(db, universe_id) : decoded.sub;

  const mdContent = buildMarkdown(
    {
      id,
      name: name.trim(),
      type: "location",
      importance,
      parent_id: parent_location_id || null,
      created_at: new Date().toISOString(),
    },
    `# ${name.trim()}\n\n${known_info ? `Known: ${typeof known_info === 'string' ? known_info : JSON.stringify(known_info)}` : ""}`
  );
  writeLoreFile(fileOwnerId || decoded.sub, "locations", filename, mdContent);

  db.prepare(
    "INSERT INTO locations (id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    decoded.sub,
    universe_id || null,
    name.trim(),
    filename,
    importance,
    canon_layer,
    parent_location_id || null,
    known_info ? JSON.stringify(known_info) : null,
    hidden_info ? JSON.stringify(hidden_info) : null
  );

  const location = db
    .prepare(
      "SELECT id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, created_at FROM locations WHERE id = ?"
    )
    .get(id);

  return NextResponse.json({ location }, { status: 201 });
}
