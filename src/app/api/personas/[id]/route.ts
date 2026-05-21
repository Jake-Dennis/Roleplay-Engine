import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { getAuthToken } from '@/lib/auth-token';
import { validateLength } from '@/lib/validation';
import { isValidUUID } from '@/lib/validation/uuid-validator';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`persona_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

const persona = db.prepare(
  "SELECT * FROM personas WHERE id = ? AND user_id = ?"
).get(id, decoded.sub);

if (!persona) {
  return NextResponse.json({ error: "Persona not found" }, { status: 404 });
}

return NextResponse.json({ persona: camelizeKeys(persona) }); });

export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`persona_write:${ip}`, "persona_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

// Verify ownership
const existing = db.prepare(
  "SELECT * FROM personas WHERE id = ? AND user_id = ?"
).get(id, decoded.sub);

if (!existing) {
  return NextResponse.json({ error: "Persona not found" }, { status: 404 });
}

  requireJson(request);
  const body = await request.json();
const { name, description, personality, scenario, firstMes, mesExample, creatorNotes, systemPrompt, postHistoryInstructions, tags, writingStyle, avatarUrl, llmModel, ttsVoice } = body;

if (name !== undefined) {
  const nameError = validateLength(name, 200, "Name");
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
}
if (description !== undefined) {
  const descError = validateLength(description, 5000, "Description");
  if (descError) return NextResponse.json({ error: descError }, { status: 400 });
}

db.prepare(
  `UPDATE personas SET
    name = COALESCE(?, name),
    description = COALESCE(?, description),
    personality = COALESCE(?, personality),
    scenario = COALESCE(?, scenario),
    first_mes = COALESCE(?, first_mes),
    mes_example = COALESCE(?, mes_example),
    creator_notes = COALESCE(?, creator_notes),
    system_prompt = COALESCE(?, system_prompt),
    post_history_instructions = COALESCE(?, post_history_instructions),
    tags = COALESCE(?, tags),
    writing_style = COALESCE(?, writing_style),
    avatar_url = COALESCE(?, avatar_url),
    llm_model = COALESCE(?, llm_model),
    tts_voice = COALESCE(?, tts_voice)
   WHERE id = ?`
).run(
  name, description, personality, scenario, firstMes, mesExample,
  creatorNotes, systemPrompt, postHistoryInstructions,
  tags ? JSON.stringify(tags) : undefined,
  writingStyle, avatarUrl, llmModel, ttsVoice, id
);

const persona = db.prepare("SELECT * FROM personas WHERE id = ?").get(id);

return NextResponse.json({ persona: camelizeKeys(persona) }); });

export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`persona_write:${ip}`, "persona_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

// Verify ownership
const existing = db.prepare(
  "SELECT * FROM personas WHERE id = ? AND user_id = ?"
).get(id, decoded.sub);

if (!existing) {
  return NextResponse.json({ error: "Persona not found" }, { status: 404 });
}

db.prepare("DELETE FROM personas WHERE id = ?").run(id);

return NextResponse.json({ success: true }); });
