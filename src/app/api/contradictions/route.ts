import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from "@/lib/with-auth";
import { detectAllContradictionsWithSemantic } from "@/lib/contradiction-detector";
import { scanUnverifiedLoreForContradictions } from "@/lib/semantic-contradiction";
import type { DbParams, PaginatedRow } from "@/lib/types";
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { getDb } from "@/lib/db";

/**
 * POST /api/contradictions
 * Run semantic + rule-based contradiction check on a specific entity.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with contradiction detection results
 * @throws 400 - If entityType or entityId are missing
 * @throws 401 - If authentication fails
 * @throws 500 - If contradiction detection fails internally
 * @throws 429 - If rate limit exceeded
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
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
  } catch (err: unknown) {
    logger.error("Contradiction check failed", err as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/contradictions
 * Scan all unverified lore for semantic contradictions (idle-time enrichment).
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with scan results
 * @throws 401 - If authentication fails
 * @throws 500 - If lore scan fails internally
 * @throws 429 - If rate limit exceeded
 */
export async function PUT(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  try {
    const result = await scanUnverifiedLoreForContradictions(userId);

    return NextResponse.json(result);
  } catch (err: unknown) {
    logger.error("Lore scan failed", err as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/contradictions
 * Get all rule-based contradictions for the authenticated user with optional entity filtering and cursor pagination.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { contradictions, nextCursor }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;

  const db = getDb();

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

  const rows = db.prepare(query).all(...params) as PaginatedRow[];

  let nextCursor: string | null = null;
  let resultItems = rows;
  if (rows.length > limit) {
    nextCursor = rows[limit].id;
    resultItems = rows.slice(0, limit);
  }

  return NextResponse.json({ contradictions: camelizeKeys(resultItems), nextCursor });
}
