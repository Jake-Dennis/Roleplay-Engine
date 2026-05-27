import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/admin/entities
 * List all resolved entities with aggregate frequency and linked wiki pages.
 * Supports name-based detail mode to fetch all mentions for a specific entity.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { entities, nextCursor } or { entity: { entityName, mentions } }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");
  const name = searchParams.get("name");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

  const db = getDb();

  // Detail mode: fetch all mentions for a specific entity
  if (name) {
    const mentions = db.prepare(`
      SELECT id, entity_name, source_table, source_id, frequency, last_seen_at, created_at
      FROM entity_mentions
      WHERE user_id = ? AND entity_name = ?
      ORDER BY last_seen_at DESC
    `).all(userId, name) as Array<Record<string, unknown>>;

    return NextResponse.json({
      entity: {
        entityName: name,
        mentions: camelizeKeys(mentions),
      },
    });
  }

  // Build conditions
  let conditions = "WHERE user_id = ?";
  const params: unknown[] = [userId];

  if (search) {
    conditions += " AND entity_name LIKE ?";
    params.push(`%${search}%`);
  }

  // Cursor-based pagination on entity_name (alphabetical)
  if (cursor) {
    conditions += " AND entity_name > ?";
    params.push(cursor);
  }

  // Aggregate query: entities with total frequency, last seen, wiki page count
  const query = `
    SELECT
      entity_name,
      SUM(frequency) as total_frequency,
      MAX(last_seen_at) as last_seen_at,
      COUNT(DISTINCT CASE WHEN source_table = 'wiki_pages' THEN source_id END) as wiki_page_count
    FROM entity_mentions
    ${conditions}
    GROUP BY entity_name
    ORDER BY total_frequency DESC, entity_name ASC
    LIMIT ?
  `;
  params.push(limit + 1);

  const rows = db.prepare(query).all(...params) as Array<{
    entity_name: string;
    total_frequency: number;
    last_seen_at: string;
    wiki_page_count: number;
  }>;

  let nextCursor: string | null = null;
  let resultItems = rows;
  if (rows.length > limit) {
    nextCursor = rows[limit].entity_name;
    resultItems = rows.slice(0, limit);
  }

  return NextResponse.json({
    entities: camelizeKeys(resultItems),
    nextCursor,
  });
});
