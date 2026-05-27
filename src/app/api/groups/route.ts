import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { ensureGroupSupport } from "@/lib/group-migrations";
import type { DbRow } from "@/lib/types";
import { badRequestError, serverError, requireJson } from "@/lib/error-response";
import { CONTENT_LIMITS } from "@/lib/config";
import { validateLength } from "@/lib/validation";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";

/**
 * GET /api/groups
 * List all groups the authenticated user belongs to (as owner or member), including member/session/universe counts.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { groups: Group[] }
 * @throws 401 - If authentication fails
 * @throws 500 - If server error occurs
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  try {
    const db = getDb();
    ensureGroupSupport(db);

    // Single query with correlated subqueries for counts (eliminates N+1)
    const groups = db.prepare(`
      SELECT g.id, g.owner_id, g.name, g.description, g.created_at,
        u.username as owner_name,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.group_id = g.id) as session_count,
        (SELECT COUNT(*) FROM universes u2 WHERE u2.group_id = g.id) as universe_count
      FROM groups g
      JOIN users u ON g.owner_id = u.id
      WHERE g.owner_id = ? OR g.id IN (
        SELECT group_id FROM group_members WHERE user_id = ?
      )
      ORDER BY g.created_at DESC
    `).all(userId, userId) as DbRow[];

    return NextResponse.json({ groups: camelizeKeys(groups) });
  } catch (err: unknown) {
    return serverError(err);
  }
}

/**
 * POST /api/groups
 * Create a new group with the authenticated user as owner.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { group: Group } (201)
 * @throws 400 - If name is missing or exceeds length limits
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  cleanupExpiredEntries();
  const limit = checkRateLimit(`create_resource:${userId}`, "create_resource");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

  try {
    requireJson(request);
    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return badRequestError("Group name is required");
    }

    const nameError = validateLength(name, 200, "Name");
    if (nameError) return badRequestError(nameError);
    const descError = validateLength(description || "", CONTENT_LIMITS.MEDIUM, "Description");
    if (descError) return badRequestError(descError);

    const db = getDb();
    ensureGroupSupport(db);

    const id = crypto.randomUUID();

    db.prepare(
      "INSERT INTO groups (id, owner_id, name, description) VALUES (?, ?, ?, ?)"
    ).run(id, userId, name.trim(), description || null);

    // Auto-add owner as member
    db.prepare(
      "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')"
    ).run(id, userId);

    const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(id);

    return NextResponse.json({ group: camelizeKeys(group) }, { status: 201 });
  } catch (err: unknown) {
    return serverError(err);
  }
}
