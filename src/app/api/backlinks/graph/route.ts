import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/backlinks/graph
 * Build a node-edge graph from all user backlinks for visualization.
 * Nodes represent entities (locations, NPCs, events, threads); edges represent linked relationships.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { nodes: Node[], edges: Edge[] }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const db = getDb();

// Get all backlinks for user
const backlinks = db.prepare(
  `SELECT b.source_type, b.source_id, b.target_type, b.target_id, b.link_type, b.context_snippet,
          CASE b.source_type
            WHEN 'location' THEN (SELECT name FROM locations WHERE id = b.source_id)
            WHEN 'npc' THEN (SELECT name FROM npcs WHERE id = b.source_id)
            WHEN 'event' THEN (SELECT title FROM events WHERE id = b.source_id)
            WHEN 'thread' THEN (SELECT title FROM narrative_threads WHERE id = b.source_id)
            ELSE 'Unknown'
          END as source_name,
          CASE b.target_type
            WHEN 'location' THEN (SELECT name FROM locations WHERE id = b.target_id)
            WHEN 'npc' THEN (SELECT name FROM npcs WHERE id = b.target_id)
            WHEN 'event' THEN (SELECT title FROM events WHERE id = b.target_id)
            WHEN 'thread' THEN (SELECT title FROM narrative_threads WHERE id = b.target_id)
            ELSE 'Unknown'
          END as target_name
   FROM backlinks b
   WHERE b.user_id = ?
   ORDER BY b.created_at DESC`
).all(userId) as {
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  link_type: string;
  context_snippet: string;
  source_name: string | null;
  target_name: string | null;
}[];

// Build node map
const nodeMap = new Map<string, { id: string; label: string; type: string }>();

for (const bl of backlinks) {
  const sourceKey = `${bl.source_type}:${bl.source_id}`;
  const targetKey = `${bl.target_type}:${bl.target_id}`;

  if (!nodeMap.has(sourceKey)) {
    nodeMap.set(sourceKey, {
      id: sourceKey,
      label: bl.source_name || bl.source_id,
      type: bl.source_type,
    });
  }
  if (!nodeMap.has(targetKey)) {
    nodeMap.set(targetKey, {
      id: targetKey,
      label: bl.target_name || bl.target_id,
      type: bl.target_type,
    });
  }
}

// Build edge list
const edges = backlinks.map((bl) => ({
  source: `${bl.source_type}:${bl.source_id}`,
  target: `${bl.target_type}:${bl.target_id}`,
  label: bl.link_type,
  strength: 0.5, // Default strength, could be calculated from context
}));

return NextResponse.json({
  nodes: Array.from(nodeMap.values()),
  edges,
}); });
