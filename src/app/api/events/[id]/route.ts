import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

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
  const event = db.prepare("SELECT * FROM events WHERE id = ? AND user_id = ?").get(id, decoded.sub);
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
  const existing = db.prepare("SELECT id FROM events WHERE id = ? AND user_id = ?").get(id, decoded.sub);
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
  db.prepare("DELETE FROM events WHERE id = ? AND user_id = ?").run(id, decoded.sub);
  return NextResponse.json({ success: true });
}
