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
  const sessionId = searchParams.get("sessionId");
  const universeId = searchParams.get("universe_id");
  const groupId = searchParams.get("group_id");

  const db = getDb();
  ensureGroupSupport(db);

  let events: any[];

  if (groupId) {
    if (!isGroupMember(db, groupId, decoded.sub)) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    events = db.prepare(
      `SELECT e.id, e.user_id, e.universe_id, e.session_id, e.title, e.event_type, e.location_id, e.participants, e.outcome, e.consequences, e.importance, e.occurred_at, e.created_at
       FROM events e
       WHERE e.universe_id IN (SELECT id FROM universes WHERE group_id = ?)
       ORDER BY e.occurred_at DESC`
    ).all(groupId);
  } else if (universeId) {
    events = db.prepare(
      `SELECT e.id, e.user_id, e.universe_id, e.session_id, e.title, e.event_type, e.location_id, e.participants, e.outcome, e.consequences, e.importance, e.occurred_at, e.created_at
       FROM events e
       WHERE e.universe_id = ?
       AND (e.user_id = ? OR e.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       ))
       ORDER BY e.occurred_at DESC`
    ).all(universeId, decoded.sub, decoded.sub);
  } else if (sessionId) {
    events = db.prepare(
      `SELECT e.id, e.user_id, e.universe_id, e.session_id, e.title, e.event_type, e.location_id, e.participants, e.outcome, e.consequences, e.importance, e.occurred_at, e.created_at
       FROM events e
       WHERE e.session_id = ?
       AND (e.user_id = ? OR e.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       ))
       ORDER BY e.occurred_at DESC`
    ).all(sessionId, decoded.sub, decoded.sub);
  } else {
    events = db.prepare(
      `SELECT e.id, e.user_id, e.universe_id, e.session_id, e.title, e.event_type, e.location_id, e.participants, e.outcome, e.consequences, e.importance, e.occurred_at, e.created_at
       FROM events e
       WHERE e.user_id = ?
       OR e.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       )
       ORDER BY e.occurred_at DESC LIMIT 50`
    ).all(decoded.sub, decoded.sub);
  }

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { sessionId, title, eventType, locationId, participants, outcome, consequences, importance, universe_id } = body;

  if (!title || !eventType) {
    return NextResponse.json({ error: "title and eventType are required" }, { status: 400 });
  }

  const db = getDb();
  ensureGroupSupport(db);
  const id = crypto.randomUUID();

  const fileOwnerId = universe_id ? getUniverseOwnerId(db, universe_id) : decoded.sub;

  db.prepare(
    "INSERT INTO events (id, user_id, universe_id, session_id, title, event_type, location_id, participants, outcome, consequences, importance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, decoded.sub, universe_id || null, sessionId || null, title, eventType,
    locationId || null,
    participants ? JSON.stringify(participants) : null,
    outcome || null,
    consequences ? JSON.stringify(consequences) : null,
    importance ? JSON.stringify(importance) : null
  );

  // Write markdown file (sanitize filename to handle long names and special chars)
  const filename = sanitizeFilename(title, id);
  const mdContent = buildMarkdown(
    { id, name: title, type: "event", importance: "medium", created_at: new Date().toISOString() },
    `# ${title}\n\n**Type:** ${eventType}\n\n## Outcome\n${outcome || "Pending"}\n`
  );
  writeLoreFile(fileOwnerId || decoded.sub, "events", filename, mdContent);

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  return NextResponse.json({ event }, { status: 201 });
}
