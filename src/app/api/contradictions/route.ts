import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { detectAllContradictionsWithSemantic } from "@/lib/contradiction-detector";
import { scanUnverifiedLoreForContradictions } from "@/lib/semantic-contradiction";
import type { DbParams } from "@/lib/types";

/**
 * POST /api/contradictions/check
 * Run semantic + rule-based contradiction check on a specific entity.
 *
 * Body: { entityType: string, entityId: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const body = await request.json();
  const { entityType, entityId } = body;

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required" },
      { status: 400 }
    );
  }

  try {
    const result = await detectAllContradictionsWithSemantic(
      entityType,
      entityId,
      userId
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Contradiction check failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contradictions/scan
 * Scan all unverified lore for semantic contradictions (idle-time enrichment).
 *
 * Body: {} (no params needed, uses authenticated user)
 */
export async function PUT(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  try {
    const result = await scanUnverifiedLoreForContradictions(userId);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Lore scan failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/contradictions
 * Get all contradictions for the authenticated user.
 * Combines rule-based and semantic contradictions.
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;

  const db = require("@/lib/db").getDb();

  // Get rule-based contradictions from entity_validations
  let conditions = "WHERE user_id = ? AND state = 'under_review'";
  const params: DbParams = [userId];

  if (entityType) { conditions += " AND entity_type = ?"; params.push(entityType); }
  if (entityId) { conditions += " AND entity_id = ?"; params.push(entityId); }

  // Cursor pagination
  if (cursor) {
    const cursorRow = db.prepare(
      "SELECT created_at FROM entity_validations WHERE id = ? AND user_id = ?"
    ).get(cursor, userId) as { created_at: string } | undefined;

    if (cursorRow) {
      conditions += " AND (created_at, id) < (?, ?)";
      params.push(cursorRow.created_at, cursor);
    }
  }

  const query = `SELECT id, entity_type, entity_id, validation_notes, created_at
     FROM entity_validations ${conditions}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`;
  params.push(limit + 1);

  const rows = db.prepare(query).all(...params) as any[];

  let nextCursor: string | null = null;
  let resultItems = rows;
  if (rows.length > limit) {
    nextCursor = rows[limit].id;
    resultItems = rows.slice(0, limit);
  }

  return NextResponse.json({ contradictions: resultItems, nextCursor });
}
