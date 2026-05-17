import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  const db = getDb();
  let memories;
  if (sessionId) {
    memories = db.prepare(
      "SELECT id, session_id, type, content, importance, related_entities, created_at FROM narrative_memories WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC"
    ).all(decoded.sub, sessionId);
  } else {
    memories = db.prepare(
      "SELECT id, session_id, type, content, importance, related_entities, created_at FROM narrative_memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    ).all(decoded.sub);
  }

  return NextResponse.json({ memories });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { sessionId, type, content, importance, relatedEntities } = body;

  if (!type || !content) {
    return NextResponse.json({ error: "type and content are required" }, { status: 400 });
  }

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
  return NextResponse.json({ memory }, { status: 201 });
}
