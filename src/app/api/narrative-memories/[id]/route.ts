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
  const memory = db.prepare("SELECT * FROM narrative_memories WHERE id = ? AND user_id = ?").get(id, decoded.sub);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json({ memory });
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
  const existing = db.prepare("SELECT id FROM narrative_memories WHERE id = ? AND user_id = ?").get(id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  const { content, type, importance, relatedEntities } = body;
  db.prepare(
    "UPDATE narrative_memories SET content = COALESCE(?, content), type = COALESCE(?, type), importance = COALESCE(?, importance), related_entities = COALESCE(?, related_entities) WHERE id = ?"
  ).run(content || null, type || null, importance ? JSON.stringify(importance) : null, relatedEntities ? JSON.stringify(relatedEntities) : null, id);
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
  db.prepare("DELETE FROM narrative_memories WHERE id = ? AND user_id = ?").run(id, decoded.sub);
  return NextResponse.json({ success: true });
}
