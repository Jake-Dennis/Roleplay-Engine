import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

const VALID_STATUSES = ["active", "paused", "resolved", "abandoned"];
const VALID_ESCALATION = ["low", "medium", "high", "critical"];
const VALID_ARC_TYPES = ["thread", "arc", "subplot", "main_plot"];

function rowToJson(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    universe_id: row.universe_id,
    session_id: row.session_id,
    title: row.title,
    description: row.description,
    arc_type: row.arc_type,
    status: row.status,
    escalation_level: row.escalation_level,
    unresolved_items: row.unresolved_items ? JSON.parse(row.unresolved_items) : [],
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const sessionId = searchParams.get("sessionId");
  const universeId = searchParams.get("universe_id");
  const status = searchParams.get("status");
  const arcType = searchParams.get("arcType");

  const db = getDb();

  // Single thread lookup
  if (id) {
    const row = db.prepare(
      "SELECT * FROM narrative_threads WHERE id = ? AND user_id = ?"
    ).get(id, decoded.sub);
    if (!row) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    return NextResponse.json({ thread: rowToJson(row) });
  }

  // List threads with filters
  let query = "SELECT * FROM narrative_threads WHERE user_id = ?";
  const params: any[] = [decoded.sub];

  if (universeId) {
    query += " AND universe_id = ?";
    params.push(universeId);
  }
  if (sessionId) {
    query += " AND session_id = ?";
    params.push(sessionId);
  }
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  if (arcType) {
    query += " AND arc_type = ?";
    params.push(arcType);
  }

  query += " ORDER BY updated_at DESC LIMIT 100";

  const rows = db.prepare(query).all(...params);
  const threads = rows.map(rowToJson);
  return NextResponse.json({ threads });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { title, description, sessionId, arcType, escalationLevel, unresolvedItems, universe_id } = body;

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
  }
  if (description && description.length > 5000) {
    return NextResponse.json({ error: "description must be 5000 characters or less" }, { status: 400 });
  }
  if (arcType && !VALID_ARC_TYPES.includes(arcType)) {
    return NextResponse.json({ error: `Invalid arc_type. Must be one of: ${VALID_ARC_TYPES.join(", ")}` }, { status: 400 });
  }
  if (escalationLevel && !VALID_ESCALATION.includes(escalationLevel)) {
    return NextResponse.json({ error: `Invalid escalation_level. Must be one of: ${VALID_ESCALATION.join(", ")}` }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO narrative_threads (id, user_id, universe_id, session_id, title, description, arc_type, status, escalation_level, unresolved_items, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
  ).run(
    id,
    decoded.sub,
    universe_id || null,
    sessionId || null,
    title.trim(),
    description || null,
    arcType || "thread",
    escalationLevel || "low",
    unresolvedItems ? JSON.stringify(unresolvedItems) : null,
    now,
    now
  );

  const row = db.prepare("SELECT * FROM narrative_threads WHERE id = ?").get(id);
  return NextResponse.json({ thread: rowToJson(row) }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { id, title, description, status, arcType, escalationLevel, unresolvedItems, universe_id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify ownership
  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM narrative_threads WHERE id = ? AND user_id = ?"
  ).get(id, decoded.sub) as { status: string; resolved_at: string | null } | undefined;
  if (!existing) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  if (title !== undefined) {
    if (title.trim().length === 0) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
  }
  if (description !== undefined && description.length > 5000) {
    return NextResponse.json({ error: "description must be 5000 characters or less" }, { status: 400 });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (arcType !== undefined && !VALID_ARC_TYPES.includes(arcType)) {
    return NextResponse.json({ error: `Invalid arc_type. Must be one of: ${VALID_ARC_TYPES.join(", ")}` }, { status: 400 });
  }
  if (escalationLevel !== undefined && !VALID_ESCALATION.includes(escalationLevel)) {
    return NextResponse.json({ error: `Invalid escalation_level. Must be one of: ${VALID_ESCALATION.join(", ")}` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const resolvedAt = status === "resolved" && existing.status !== "resolved" ? now : existing.resolved_at;

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { updates.push("title = ?"); values.push(title.trim()); }
  if (description !== undefined) { updates.push("description = ?"); values.push(description); }
  if (status !== undefined) { updates.push("status = ?"); values.push(status); }
  if (arcType !== undefined) { updates.push("arc_type = ?"); values.push(arcType); }
  if (escalationLevel !== undefined) { updates.push("escalation_level = ?"); values.push(escalationLevel); }
  if (unresolvedItems !== undefined) { updates.push("unresolved_items = ?"); values.push(JSON.stringify(unresolvedItems)); }
  if (universe_id !== undefined) { updates.push("universe_id = ?"); values.push(universe_id || null); }
  updates.push("resolved_at = ?", "updated_at = ?");
  values.push(resolvedAt, now, id, decoded.sub);

  db.prepare(`UPDATE narrative_threads SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);

  const row = db.prepare("SELECT * FROM narrative_threads WHERE id = ?").get(id);
  return NextResponse.json({ thread: rowToJson(row) });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM narrative_threads WHERE id = ? AND user_id = ?"
  ).get(id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  db.prepare("DELETE FROM narrative_threads WHERE id = ? AND user_id = ?").run(id, decoded.sub);
  return NextResponse.json({ success: true });
}
