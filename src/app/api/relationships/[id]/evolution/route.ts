import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseEmotionalState } from "@/lib/emotion-utils";
import { ensureGroupSupport } from "@/lib/group-migrations";
import type { DbResult } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { hasRelationshipAccess } from '@/lib/relationship-access';
import type { RelationshipEvolutionRow, RelationshipEvolutionEntry } from '@/lib/relationship-types';

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

  // Verify relationship access
  const rel = hasRelationshipAccess(db, id, decoded.sub);
  if (!rel) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });

  // Get evolution history
  const history = db.prepare(`
    SELECT id, emotional_state, relationship_stage, trigger_event, recorded_at
    FROM relationship_evolution
    WHERE relationship_id = ?
    ORDER BY recorded_at ASC
  `).all(id);

  // Parse emotional states
  const parsedHistory: RelationshipEvolutionEntry[] = (history as RelationshipEvolutionRow[]).map((entry) => ({
    ...entry,
    emotional_state: parseEmotionalState(entry.emotional_state),
  }));

  return NextResponse.json({ history: parsedHistory });
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

  // Verify relationship access
  const rel = hasRelationshipAccess(db, id, decoded.sub);
  if (!rel) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });

  const body = await request.json();
  const { emotionalState, relationshipStage, triggerEvent } = body;

  const entryId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO relationship_evolution (id, relationship_id, user_id, emotional_state, relationship_stage, trigger_event)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entryId,
    id,
    decoded.sub,
    emotionalState ? JSON.stringify(emotionalState) : null,
    relationshipStage || null,
    triggerEvent || null
  );

  const entry = db.prepare("SELECT * FROM relationship_evolution WHERE id = ?").get(entryId) as {
    id: string;
    relationship_id: string;
    user_id: string;
    emotional_state: string | null;
    relationship_stage: string | null;
    trigger_event: string | null;
    recorded_at: string;
  } | undefined;

  if (!entry) {
    return NextResponse.json({ error: "Failed to create evolution entry" }, { status: 500 });
  }

  return NextResponse.json({
    entry: {
      ...entry,
      emotional_state: parseEmotionalState(entry.emotional_state),
    },
  }, { status: 201 });
}
