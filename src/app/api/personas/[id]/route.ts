import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { withAuth } from '@/lib/with-auth';
import { CONTENT_LIMITS } from '@/lib/config';
import { validateLength } from '@/lib/validation';
import { isValidUUID } from '@/lib/validation/uuid-validator';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/personas/{id}
 * Get a single persona by id.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the persona id
 * @returns NextResponse with { persona: Persona }
 * @throws 400 - If ID format is invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If persona not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

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
).get(id, userId);

if (!persona) {
  return NextResponse.json({ error: "Persona not found" }, { status: 404 });
}

return NextResponse.json({ persona: camelizeKeys(persona) }); });

/**
 * PUT /api/personas/{id}
 * Update a persona's fields. Supports partial updates of all persona properties.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the persona id
 * @returns NextResponse with { persona: Persona }
 * @throws 400 - If ID format is invalid or validation fails
 * @throws 401 - If authentication fails
 * @throws 404 - If persona not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

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
).get(id, userId);

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
  const descError = validateLength(description, CONTENT_LIMITS.MEDIUM, "Description");
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

/**
 * DELETE /api/personas/{id}
 * Delete a persona by id.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the persona id
 * @returns NextResponse with { success: true }
 * @throws 400 - If ID format is invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If persona not found
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

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
).get(id, userId);

if (!existing) {
  return NextResponse.json({ error: "Persona not found" }, { status: 404 });
}

db.prepare("DELETE FROM personas WHERE id = ?").run(id);

return NextResponse.json({ success: true }); });
