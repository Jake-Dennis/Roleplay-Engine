import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-token";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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

  return NextResponse.json({ users, nextCursor });
}
