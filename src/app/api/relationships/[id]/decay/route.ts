import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { processRelationshipDecay, getDecayStats } from "@/lib/relationship-decay";

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

  // Verify ownership
  const relationship = db.prepare(
    "SELECT * FROM relationships WHERE id = ? AND user_id = ?"
  ).get(id, decoded.sub);

  if (!relationship) {
    return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
  }

  // Get decay stats for user
  const stats = getDecayStats(decoded.sub);

  return NextResponse.json({
    relationship,
    stats,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  // Verify ownership
  const relationship = db.prepare(
    "SELECT * FROM relationships WHERE id = ? AND user_id = ?"
  ).get(id, decoded.sub);

  if (!relationship) {
    return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
  }

  // Process decay for this user
  const result = processRelationshipDecay(decoded.sub);

  return NextResponse.json({
    success: true,
    decayedCount: result.decayedCount,
    decayedRelationships: result.decayedRelationships,
  });
}
