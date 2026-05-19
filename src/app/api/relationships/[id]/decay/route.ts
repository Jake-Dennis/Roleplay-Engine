import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { processRelationshipDecay, getDecayStats } from "@/lib/relationship-decay";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";
import type { DbDatabase, DbResult } from "@/lib/types";

function hasRelationshipAccess(db: DbDatabase, relationshipId: string, userId: string): DbResult | null {
  const rel = db.prepare(
    `SELECT r.*, u.group_id
     FROM relationships r
     LEFT JOIN universes u ON r.universe_id = u.id
     WHERE r.id = ?`
  ).get(relationshipId) as DbResult | undefined;

  if (!rel) return null;

  // Direct ownership
  if (rel.user_id === userId) return rel;

  // Group membership
  if (rel.group_id && isGroupMember(db, rel.group_id, userId)) return rel;

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  // Verify ownership
  const relationship = hasRelationshipAccess(db, id, decoded.sub);
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

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  // Verify ownership
  const relationship = hasRelationshipAccess(db, id, decoded.sub);
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
