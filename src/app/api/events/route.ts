import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, sanitizeFilename } from "@/lib/lore-markdown";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const universeId = searchParams.get("universe_id");

  const db = getDb();
  let events;

  if (universeId) {
    events = db.prepare(
      "SELECT id, user_id, universe_id, session_id, title, event_type, location_id, participants, outcome, consequences, importance, occurred_at, created_at FROM events WHERE user_id = ? AND universe_id = ? ORDER BY occurred_at DESC"
    ).all(decoded.sub, universeId);
  } else if (sessionId) {
    events = db.prepare(
      "SELECT id, user_id, universe_id, session_id, title, event_type, location_id, participants, outcome, consequences, importance, occurred_at, created_at FROM events WHERE user_id = ? AND session_id = ? ORDER BY occurred_at DESC"
    ).all(decoded.sub, sessionId);
  } else {
    events = db.prepare(
      "SELECT id, user_id, universe_id, session_id, title, event_type, location_id, participants, outcome, consequences, importance, occurred_at, created_at FROM events WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 50"
    ).all(decoded.sub);
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
  const id = crypto.randomUUID();

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
  writeLoreFile(decoded.sub, "events", filename, mdContent);

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  return NextResponse.json({ event }, { status: 201 });
}
