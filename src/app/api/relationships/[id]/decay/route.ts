import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { processRelationshipDecay, getDecayStats } from "@/lib/relationship-decay";
import { ensureGroupSupport } from "@/lib/group-migrations";
import type { DbResult } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { hasRelationshipAccess } from '@/lib/relationship-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
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
  const token = getAuthToken(request);
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
