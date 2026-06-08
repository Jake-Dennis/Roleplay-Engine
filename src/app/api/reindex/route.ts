import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { queueJob } from "@/lib/job-processor";
import { generateIndex } from "@/lib/wiki/index-generator";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { requireJson } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { withErrorHandler } from "@/lib/with-error-handler";
import { logger } from '@/lib/logger';

/**
 * POST /api/reindex
 *
 * Triggers reindexing operations. Supports:
 * - "wiki": Regenerates the wiki index.md from all wiki pages.
 * - "embeddings": Queues generate_embeddings jobs for ALL entities
 *   (messages, locations, NPCs, events, narrative_memories).
 * - "all": Runs both operations.
 *
 * Wiki reindex is instant (no LLM calls). Embedding reindex queues
 * background jobs — they process one at a time via the job processor.
 *
 * @param request - The incoming Next.js request object with JSON body { type: "wiki" | "embeddings" | "all" }
 * @returns NextResponse with { success: true, message, jobCount?, wikiPath? }
 * @throws 400 - If type is missing or invalid
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`reindex:${ip}`, "jobs_trigger");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
  const { type } = body;

  if (!type || !["wiki", "embeddings", "all"].includes(type)) {
    return NextResponse.json({ error: "Invalid type. Must be 'wiki', 'embeddings', or 'all'." }, { status: 400 });
  }

  const results: { wiki?: string; jobCount?: number } = {};

  // --- Wiki index reindex ---
  if (type === "wiki" || type === "all") {
    try {
      const wikiRoot = getWikiRoot(userId);
      const indexPath = generateIndex(wikiRoot);
      results.wiki = indexPath;
      logger.info(`Reindexed wiki index for user ${userId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Wiki reindex failed: ${message}` }, { status: 500 });
    }
  }

  // --- Vector embedding reindex ---
  if (type === "embeddings" || type === "all") {
    try {
      const db = getDb();
      let jobCount = 0;

      // Collect ALL entities for this user across all entity types
      // Uses UNION ALL to get all entities regardless of existing embeddings.
      // The processEmbeddings function uses INSERT OR REPLACE, so existing
      // embeddings will be overwritten.
      const allEntities = db.prepare(`
        SELECT 'message' as entity_type, m.id as entity_id
        FROM messages m
        WHERE m.session_id IN (SELECT id FROM sessions WHERE owner_id = ?)
          AND m.is_deleted = 0

        UNION ALL

        SELECT 'location' as entity_type, l.id as entity_id
        FROM locations l
        WHERE l.user_id = ?

        UNION ALL

        SELECT 'npc' as entity_type, n.id as entity_id
        FROM npcs n
        WHERE n.user_id = ?

        UNION ALL

        SELECT 'event' as entity_type, e.id as entity_id
        FROM events e
        WHERE e.user_id = ?

        UNION ALL

        SELECT 'narrative_memory' as entity_type, nm.id as entity_id
        FROM narrative_memories nm
        WHERE nm.user_id = ?
      `).all(userId, userId, userId, userId, userId) as { entity_type: string; entity_id: string }[];

      // Queue embedding jobs for all entities — job processor handles
      // them one at a time in priority order (high before low).
      // All queued at "low" priority so they don't block time-sensitive jobs.
      for (const entity of allEntities) {
        queueJob(userId, "generate_embeddings", {
          entityType: entity.entity_type,
          entityId: entity.entity_id,
          userId,
        }, "low");
        jobCount++;
      }

      results.jobCount = jobCount;
      logger.info(`Queued ${jobCount} embedding reindex jobs for user ${userId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Embedding reindex failed: ${message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    message: type === "wiki"
      ? "Wiki index rebuilt successfully"
      : type === "embeddings"
        ? `Queued ${results.jobCount} embedding reindex jobs`
        : `Wiki index rebuilt. Queued ${results.jobCount} embedding reindex jobs.`,
    ...results,
  });
});
