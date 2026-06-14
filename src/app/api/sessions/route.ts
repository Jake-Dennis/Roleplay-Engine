import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";
import type { DbResult } from "@/lib/types";
import { forbiddenError, badRequestError, requireJson } from "@/lib/error-response";
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import path from "path";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { writeWikiPage } from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";

/**
 * GET /api/sessions
 *
 * Lists all sessions the authenticated user has access to. Supports filtering
 * by group_id and scope ("personal" for user's own sessions only).
 *
 * @param request - The incoming Next.js request object with optional query params: group_id, scope
 * @returns NextResponse with { sessions: Session[] }
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user is not a member of the specified group
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const db = getDb();
ensureGroupSupport(db);

const url = new URL(request.url);
const groupId = url.searchParams.get("group_id");
const scope = url.searchParams.get("scope");

let sessions: DbResult[];

if (groupId) {
  if (!isGroupMember(db, groupId, userId)) {
    return forbiddenError();
  }
  sessions = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.group_id = ?
    ORDER BY s.updated_at DESC
  `).all(groupId) as DbResult[];
} else if (scope === "personal") {
  // Only personal sessions
  sessions = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.group_id IS NULL AND (s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
    ORDER BY s.updated_at DESC
  `).all(userId, userId) as DbResult[];
} else {
  // Return ALL sessions the user has access to (personal + all groups)
  sessions = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    )
    ORDER BY s.updated_at DESC
  `).all(userId, userId) as DbResult[];
}

return NextResponse.json({ sessions: camelizeKeys(sessions) }); });

/**
 * POST /api/sessions
 *
 * Creates a new roleplay session in the specified universe. The creator
 * is automatically added as a participant with 'player' role and a
 * scene_state is initialized.
 *
 * @param request - The incoming Next.js request object containing JSON body with name, universe_id, optional timeline_id, type, group_id
 * @returns NextResponse with { session: Session } (201)
 * @throws 400 - If name or universe_id is missing, or name exceeds 200 characters
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user is not a member of the specified group
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { name, universe_id, timeline_id, type = "solo", group_id, persona_id } = body;

if (!name) {
  return badRequestError("Session name is required");
}

if (!universe_id) {
  return badRequestError("universe_id is required");
}

const nameError = validateLength(name, 200, "Name");
if (nameError) return badRequestError(nameError);

const db = getDb();
ensureGroupSupport(db);

if (group_id && !isGroupMember(db, group_id, userId)) {
  return forbiddenError();
}

const id = crypto.randomUUID();

db.prepare(
  "INSERT INTO sessions (id, owner_id, name, universe_id, timeline_id, status, type, group_id, persona_id) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)"
).run(id, userId, name, universe_id || null, timeline_id || null, type, group_id || null, persona_id || null);

db.prepare(
  "INSERT OR IGNORE INTO session_participants (session_id, user_id, role) VALUES (?, ?, 'player')"
).run(id, userId);

db.prepare(
  "INSERT INTO scene_states (id, session_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
).run(crypto.randomUUID(), id);

// Auto-create a wiki page from the persona if both persona and universe are specified
if (persona_id && universe_id) {
  try {
    const persona = db.prepare(
      "SELECT display_name as name FROM entity_registry WHERE id = ? AND user_id = ?"
    ).get(persona_id, userId) as Record<string, unknown> | undefined;

    if (persona) {
      const wikiRoot = getWikiRoot(userId, universe_id);
      const safeName = (persona.name as string || "unknown").replace(/[<>:"/\\|?*]/g, "_").trim();
      const pageContent = [
        `## ${persona.name}`,
        ``,
        persona.description ? `${persona.description}\n` : "",
        persona.personality ? `### Personality\n${persona.personality}\n` : "",
        persona.writing_style ? `### Writing Style\n${persona.writing_style}\n` : "",
        persona.scenario ? `### Scenario\n${persona.scenario}\n` : "",
        persona.first_mes ? `### First Message\n${persona.first_mes}\n` : "",
        persona.mes_example ? `### Example Dialogue\n${persona.mes_example}\n` : "",
      ].filter(Boolean).join("\n");

      let parsedTags: string[] = [];
      if (typeof persona.tags === "string") {
        try { parsedTags = JSON.parse(persona.tags as string); } catch { /* ignore */ }
      }

      writeWikiPage(path.join(wikiRoot, "entities", `${safeName}.md`), pageContent, {
        title: persona.name as string,
        type: "entity",
        subtype: "character",
        status: "draft",
        universe: universe_id,
        tags: [...parsedTags, "persona", "auto-generated"],
        persona_id: persona.id as string,
        entity_id: persona.id as string,
        source: "persona",
      });
      generateIndex(wikiRoot);
    }
  } catch (err) {
    // Wiki creation failure should not break session creation
    console.error("Failed to auto-create persona wiki page:", err);
  }
}

const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);

return NextResponse.json({ session: camelizeKeys(session) }, { status: 201 }); });
