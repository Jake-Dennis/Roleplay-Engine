import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { ensureGroupSupport } from "@/lib/group-migrations";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";

/**
 * GET /api/users
 * Search users by username, optionally excluding members of a specific group.
 * Supports cursor-based pagination.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { users: { id, username }[], nextCursor }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

cleanupExpiredEntries();
const rl = checkRateLimit(`user_search:${userId}`, "user_search");
if (!rl.allowed) return createRateLimitResponse(rl.retryAfter!);

const url = new URL(request.url);
const groupId = url.searchParams.get("group_id");
const q = url.searchParams.get("q") || "";
const cursor = url.searchParams.get("cursor");
const limitParam = url.searchParams.get("limit");
const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;

const db = getDb();
ensureGroupSupport(db);

let users: { id: string; username: string }[];
let nextCursor: string | null = null;

// Build base query
let baseQuery: string;
let queryParams: unknown[] = [];

if (groupId) {
  // Return users who are NOT already members of this group
  baseQuery = `
    SELECT id, username FROM users
    WHERE id NOT IN (SELECT user_id FROM group_members WHERE group_id = ?)
  `;
  queryParams = [groupId];
  if (q.trim()) {
    baseQuery += " AND LOWER(username) LIKE LOWER(?)";
    queryParams.push(`%${q.trim()}%`);
  }
} else {
  // Return all users (for general user search)
  baseQuery = `SELECT id, username FROM users WHERE 1=1`;
  if (q.trim()) {
    baseQuery += " AND LOWER(username) LIKE LOWER(?)";
    queryParams.push(`%${q.trim()}%`);
  }
}

// Cursor pagination
if (cursor) {
  const cursorRow = db.prepare(
    "SELECT username FROM users WHERE id = ?"
  ).get(cursor) as { username: string } | undefined;

  if (cursorRow) {
    baseQuery += " AND (username, id) > (?, ?)";
    queryParams.push(cursorRow.username, cursor);
  }
}

baseQuery += " ORDER BY username ASC, id ASC LIMIT ?";
queryParams.push(limit + 1);

const rows = db.prepare(baseQuery).all(...queryParams) as { id: string; username: string }[];

if (rows.length > limit) {
  nextCursor = rows[limit].id;
  users = rows.slice(0, limit);
} else {
  users = rows;
}

return NextResponse.json({ users, nextCursor }); });
