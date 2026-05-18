import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

function hasEntityAccess(db: any, entityType: string, entityId: string, userId: string): any {
  let entity: any = null;
  if (entityType === "events") {
    entity = db.prepare(
      `SELECT e.*, u.group_id, g.owner_id as group_owner_id
       FROM events e
       LEFT JOIN universes u ON e.universe_id = u.id
       LEFT JOIN groups g ON u.group_id = g.id
       WHERE e.id = ?`
    ).get(entityId);
  }

  if (!entity) return null;

  // Direct ownership
  if (entity.user_id === userId) return entity;

  // Group membership
  if (entity.group_id && isGroupMember(db, entity.group_id, userId)) return entity;

  return null;
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

  const event = hasEntityAccess(db, "events", id, decoded.sub);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ event });
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

  const existing = hasEntityAccess(db, "events", id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { title, outcome, consequences, importance } = body;
  db.prepare(
    "UPDATE events SET title = COALESCE(?, title), outcome = COALESCE(?, outcome), consequences = COALESCE(?, consequences), importance = COALESCE(?, importance) WHERE id = ?"
  ).run(title || null, outcome || null, consequences ? JSON.stringify(consequences) : null, importance ? JSON.stringify(importance) : null, id);
  return NextResponse.json({ success: true });
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

  const existing = hasEntityAccess(db, "events", id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  db.prepare("DELETE FROM events WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
