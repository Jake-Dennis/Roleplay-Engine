import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";
import type { DbResult } from "@/lib/types";
import { forbiddenError, badRequestError, serverError, requireJson } from "@/lib/error-response";
import { validateLength } from "@/lib/validation";
import { parseBoundaries } from '@/lib/universe-utils';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { writeWikiPage } from '@/lib/wiki/file-io';
import { generateIndex } from '@/lib/wiki/index-generator';
import path from "path";

/**
 * Lists universes accessible to the user, with optional filtering by group or scope.
 *
 * @param request - The incoming Next.js request object (query params: `group_id`, `scope` = "personal")
 * @returns NextResponse with `{ universes }` — array of camelCase universe objects with parsed boundaries
 * @throws 401 - If authentication fails
 * @throws 403 - If not a member of the requested group
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`universe_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const db = getDb();
ensureGroupSupport(db);

const url = new URL(request.url);
const groupId = url.searchParams.get("group_id");
const scope = url.searchParams.get("scope");

let universes: DbResult[];

if (groupId) {
  if (!isGroupMember(db, groupId, userId)) {
    return forbiddenError();
  }
  universes = db.prepare(
      `SELECT u.id, u.user_id, u.group_id, u.name, u.description, u.canon_mode, u.lore_source, u.tone, u.time_period, u.boundaries, u.created_at
       FROM universes u
       WHERE u.group_id = ?
       ORDER BY u.created_at DESC`
  ).all(groupId) as DbResult[];
} else if (scope === "personal") {
  // Only personal universes
  universes = db.prepare(
    `SELECT u.id, u.user_id, u.group_id, u.name, u.description, u.canon_mode, u.lore_source, u.tone, u.time_period, u.boundaries, u.created_at
     FROM universes u
     WHERE u.user_id = ? AND u.group_id IS NULL
     ORDER BY u.created_at DESC`
  ).all(userId) as DbResult[];
} else {
  // Return ALL universes the user has access to (personal + all groups)
  universes = db.prepare(
    `SELECT u.id, u.user_id, u.group_id, u.name, u.description, u.canon_mode, u.lore_source, u.tone, u.time_period, u.boundaries, u.created_at
     FROM universes u
     WHERE u.user_id = ? OR u.group_id IN (
       SELECT group_id FROM group_members WHERE user_id = ?
     )
     ORDER BY u.created_at DESC`
  ).all(userId, userId) as DbResult[];
}

const parsed = universes.map((u) => ({
  ...u,
  boundaries: parseBoundaries(u.boundaries as string | null),
}));

return NextResponse.json({ universes: camelizeKeys(parsed) }); });

/**
 * Creates a new universe with an initial wiki page.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ name, description?, canon_mode?, lore_source?, tone?, time_period?, boundaries?, group_id? }`
 * @returns NextResponse with `{ universe }` (201) — the created universe in camelCase with parsed boundaries
 * @throws 400 - If name is missing, validation fails, or canon_mode is invalid
 * @throws 401 - If authentication fails
 * @throws 403 - If not a member of the target group
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If universe retrieval fails after insert
 */
export const POST = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`universe_write:${ip}`, "universe_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { name, description, canon_mode = "strict", lore_source, tone, time_period, boundaries, group_id } = body;

if (!name || !name.trim()) {
  return badRequestError("Universe name is required");
}

const nameError = validateLength(name, 200, "Name");
if (nameError) return badRequestError(nameError);

const validModes = ["strict", "loose", "custom"];
if (!validModes.includes(canon_mode)) {
  return badRequestError(`Invalid canon_mode. Must be one of: ${validModes.join(", ")}`);
}

const db = getDb();
ensureGroupSupport(db);

if (group_id && !isGroupMember(db, group_id, userId)) {
  return forbiddenError();
}

const id = crypto.randomUUID();

const boundariesJson = Array.isArray(boundaries)
  ? JSON.stringify(boundaries)
  : boundaries
    ? JSON.stringify(boundaries.split("\n").map((s: string) => s.trim()).filter(Boolean))
    : null;

db.prepare(
  "INSERT INTO universes (id, user_id, group_id, name, description, canon_mode, lore_source, tone, time_period, boundaries) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run(id, userId, group_id || null, name.trim(), description || null, canon_mode, lore_source || null, tone || null, time_period || null, boundariesJson);

// Create initial wiki page with universe info
const wikiRoot = getWikiRoot(userId, id);
let boundariesText = "";
if (boundariesJson) {
  try {
    const parsed = JSON.parse(boundariesJson);
    if (Array.isArray(parsed)) {
      boundariesText = parsed.map((b) => `- ${b}`).join("\n");
    }
  } catch { /* ignore */ }
}
const pageContent = [
  `## ${name.trim()}`,
  ``,
  description ? `${description}\n` : "",
  tone ? `**Tone:** ${tone}\n` : "",
  time_period ? `**Time Period:** ${time_period}\n` : "",
  lore_source ? `**Lore Source:** ${lore_source}\n` : "",
  boundariesText ? `**Boundaries:**\n${boundariesText}\n` : "",
].filter(Boolean).join("\n");
writeWikiPage(path.join(wikiRoot, "concepts", "about.md"), pageContent, {
  title: `${name.trim()} — Universe Overview`,
  type: "concept",
  status: "draft",
  time_period: time_period || null,
  tags: ["auto-generated", "universe-info"],
});
generateIndex(wikiRoot);

const universe = db
  .prepare(
    "SELECT id, user_id, group_id, name, canon_mode, lore_source, tone, time_period, boundaries, created_at FROM universes WHERE id = ?"
  )
  .get(id) as Record<string, unknown> | undefined;

if (!universe) {
    return serverError(new Error("Universe not found after insert"));
}

const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

return NextResponse.json({ universe: camelizeKeys(parsed) }, { status: 201 }); });
