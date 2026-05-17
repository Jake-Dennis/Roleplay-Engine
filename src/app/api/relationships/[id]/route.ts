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
  const rel = db.prepare("SELECT * FROM relationships WHERE id = ? AND user_id = ?").get(id, decoded.sub);
  if (!rel) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
  return NextResponse.json({ relationship: rel });
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

  const existing = db.prepare("SELECT id FROM relationships WHERE id = ? AND user_id = ?").get(id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });

  const { emotionalState, sharedHistory, relationshipStage, decayRates } = body;
  db.prepare(
    "UPDATE relationships SET emotional_state = COALESCE(?, emotional_state), shared_history = COALESCE(?, shared_history), relationship_stage = COALESCE(?, relationship_stage), decay_rates = COALESCE(?, decay_rates), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(
    emotionalState ? JSON.stringify(emotionalState) : null,
    sharedHistory ? JSON.stringify(sharedHistory) : null,
    relationshipStage || null,
    decayRates ? JSON.stringify(decayRates) : null,
    id
  );

  const rel = db.prepare("SELECT * FROM relationships WHERE id = ?").get(id);
  return NextResponse.json({ relationship: rel });
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
  const existing = db.prepare("SELECT id FROM relationships WHERE id = ? AND user_id = ?").get(id, decoded.sub);
  if (!existing) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });

  db.prepare("DELETE FROM relationships WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
