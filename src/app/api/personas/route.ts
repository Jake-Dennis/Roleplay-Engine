import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { withAuth } from '@/lib/with-auth';
import { CONTENT_LIMITS } from '@/lib/config';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from '@/lib/rate-limiter';

/**
 * GET /api/personas
 * List all personas for the authenticated user, ordered by creation date descending.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { personas: Persona[] }
 * @throws 401 - If authentication fails
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const db = getDb();
ensureGroupSupport(db);

const personas = db.prepare(
  "SELECT * FROM personas WHERE user_id = ? ORDER BY created_at DESC"
).all(userId);

return NextResponse.json({ personas: camelizeKeys(personas) }); });

/**
 * POST /api/personas
 * Create a new persona. If this is the user's first persona, it is automatically set as active.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { persona: Persona } (201)
 * @throws 400 - If name is missing or exceeds length limits
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

cleanupExpiredEntries();
const limit = checkRateLimit(`persona_npc:${userId}`, "persona_npc");
if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

const db = getDb();
ensureGroupSupport(db);

  requireJson(request);
  const body = await request.json();
const { name, description, personality, scenario, firstMes, mesExample, creatorNotes, systemPrompt, postHistoryInstructions, tags, writingStyle, avatarUrl, llmModel, ttsVoice } = body;

if (!name) {
  return NextResponse.json({ error: "Name is required" }, { status: 400 });
}

const nameError = validateLength(name, 200, "Name");
if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
const descError = validateLength(description || "", CONTENT_LIMITS.MEDIUM, "Description");
if (descError) return NextResponse.json({ error: descError }, { status: 400 });

const id = crypto.randomUUID();

// If this is the first persona, make it active
const count = db.prepare("SELECT COUNT(*) as c FROM personas WHERE user_id = ?").get(userId) as { c: number };
const isActive = count.c === 0 ? 1 : 0;

db.prepare(
  `INSERT INTO personas (id, user_id, name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt, post_history_instructions, tags, writing_style, avatar_url, llm_model, tts_voice, is_active)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(id, userId, name, description || null, personality || null, scenario || null, firstMes || null, mesExample || null, creatorNotes || null, systemPrompt || null, postHistoryInstructions || null, tags ? JSON.stringify(tags) : null, writingStyle || null, avatarUrl || null, llmModel || null, ttsVoice || null, isActive);

const persona = db.prepare("SELECT * FROM personas WHERE id = ?").get(id);

return NextResponse.json({ persona: camelizeKeys(persona) }, { status: 201 }); });
