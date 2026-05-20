import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAuthToken } from '@/lib/auth-token';
import { validateLength } from '@/lib/validation';

interface PaginatedRow { id: string; [key: string]: unknown }

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const limitParam = searchParams.get("limit");
  const cursor = searchParams.get("cursor");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 50;

  const db = getDb();

  let query = "SELECT id, session_id, type, content, importance, related_entities, created_at FROM narrative_memories WHERE user_id = ?";
  const params: unknown[] = [decoded.sub];

  if (sessionId) {
    query += " AND session_id = ?";
    params.push(sessionId);
  }

  if (cursor) {
    const cursorMemory = db.prepare(
      "SELECT created_at FROM narrative_memories WHERE id = ? AND user_id = ?"
    ).get(cursor, decoded.sub) as { created_at: string } | undefined;

    if (cursorMemory) {
      query += " AND (created_at, id) < (?, ?)";
      params.push(cursorMemory.created_at, cursor);
    }
  }

  query += " ORDER BY created_at DESC, id DESC LIMIT ?";
  params.push(limit + 1);

  const memories = db.prepare(query).all(...params) as PaginatedRow[];

  let nextCursor: string | null = null;
  let resultMemories = memories;
  if (memories.length > limit) {
    nextCursor = memories[limit].id;
    resultMemories = memories.slice(0, limit);
  }

  return NextResponse.json({ memories: camelizeKeys(resultMemories), nextCursor });
}

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    requireJson(request);
    const body = await request.json();
  const { sessionId, type, content, importance, relatedEntities } = body;

  if (!type || !content) {
    return NextResponse.json({ error: "type and content are required" }, { status: 400 });
  }

  const contentError = validateLength(content, 100000, "Content");
  if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });

  const db = getDb();
  const id = crypto.randomUUID();

  // Calculate composite importance score
  const impScore = importance || { emotional: "medium", local: "medium", canonical: "medium", recency: "high" };
  const scoreMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const compositeScore =
    (scoreMap[impScore.emotional] || 2) * 0.35 +
    (scoreMap[impScore.local] || 2) * 0.25 +
    (scoreMap[impScore.canonical] || 2) * 0.20 +
    (scoreMap[impScore.recency] || 3) * 0.20;

  db.prepare(
    "INSERT INTO narrative_memories (id, user_id, session_id, type, content, importance, related_entities) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, decoded.sub, sessionId || null, type, content,
    JSON.stringify({ ...impScore, composite: Math.round(compositeScore * 10) / 10 }),
    relatedEntities ? JSON.stringify(relatedEntities) : null
  );

  const memory = db.prepare("SELECT * FROM narrative_memories WHERE id = ?").get(id);
  return NextResponse.json({ memory: camelizeKeys(memory) }, { status: 201 });
}
