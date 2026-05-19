import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureGroupSupport } from "@/lib/group-migrations";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  ensureGroupSupport(db);

  const personas = db.prepare(
    "SELECT * FROM personas WHERE user_id = ? ORDER BY created_at DESC"
  ).all(decoded.sub);

  return NextResponse.json({ personas });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  ensureGroupSupport(db);

  const body = await request.json();
  const { name, description, personality, scenario, firstMes, mesExample, creatorNotes, systemPrompt, postHistoryInstructions, tags, writingStyle, avatarUrl, llmModel, ttsVoice } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = crypto.randomUUID();

  // If this is the first persona, make it active
  const count = db.prepare("SELECT COUNT(*) as c FROM personas WHERE user_id = ?").get(decoded.sub) as { c: number };
  const isActive = count.c === 0 ? 1 : 0;

  db.prepare(
    `INSERT INTO personas (id, user_id, name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt, post_history_instructions, tags, writing_style, avatar_url, llm_model, tts_voice, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, decoded.sub, name, description || null, personality || null, scenario || null, firstMes || null, mesExample || null, creatorNotes || null, systemPrompt || null, postHistoryInstructions || null, tags ? JSON.stringify(tags) : null, writingStyle || null, avatarUrl || null, llmModel || null, ttsVoice || null, isActive);

  const persona = db.prepare("SELECT * FROM personas WHERE id = ?").get(id);

  return NextResponse.json({ persona }, { status: 201 });
}
