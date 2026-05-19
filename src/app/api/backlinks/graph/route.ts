import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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
  ).all(decoded.sub) as {
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
  });
}
