import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { detectAllContradictionsWithSemantic } from "@/lib/contradiction-detector";
import { scanUnverifiedLoreForContradictions } from "@/lib/semantic-contradiction";

/**
 * POST /api/contradictions/check
 * Run semantic + rule-based contradiction check on a specific entity.
 *
 * Body: { entityType: string, entityId: string }
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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
      decoded.sub
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
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  try {
    const result = await scanUnverifiedLoreForContradictions(decoded.sub);

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
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  const db = require("@/lib/db").getDb();

  // Get rule-based contradictions from entity_validations
  let conditions = "WHERE user_id = ? AND state = 'under_review'";
  const params: any[] = [decoded.sub];

  if (entityType) { conditions += " AND entity_type = ?"; params.push(entityType); }
  if (entityId) { conditions += " AND entity_id = ?"; params.push(entityId); }

  const validations = db.prepare(
    `SELECT id, entity_type, entity_id, validation_notes, created_at
     FROM entity_validations ${conditions}
     ORDER BY created_at DESC
     LIMIT 50`
  ).all(...params);

  return NextResponse.json({ contradictions: validations });
}
