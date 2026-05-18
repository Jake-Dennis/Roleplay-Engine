import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-token";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const url = new URL(request.url);
  const groupId = url.searchParams.get("group_id");
  const q = url.searchParams.get("q") || "";

  const db = getDb();
  ensureGroupSupport(db);

  let users: { id: string; username: string }[];

  if (groupId) {
    // Return users who are NOT already members of this group
    if (q.trim()) {
      users = db.prepare(`
        SELECT id, username FROM users
        WHERE id NOT IN (SELECT user_id FROM group_members WHERE group_id = ?)
        AND LOWER(username) LIKE LOWER(?)
        ORDER BY username ASC
        LIMIT 20
      `).all(groupId, `%${q.trim()}%`) as { id: string; username: string }[];
    } else {
      users = db.prepare(`
        SELECT id, username FROM users
        WHERE id NOT IN (SELECT user_id FROM group_members WHERE group_id = ?)
        ORDER BY username ASC
        LIMIT 20
      `).all(groupId) as { id: string; username: string }[];
    }
  } else {
    // Return all users (for general user search)
    if (q.trim()) {
      users = db.prepare(`
        SELECT id, username FROM users
        WHERE LOWER(username) LIKE LOWER(?)
        ORDER BY username ASC
        LIMIT 20
      `).all(`%${q.trim()}%`) as { id: string; username: string }[];
    } else {
      users = db.prepare(`
        SELECT id, username FROM users
        ORDER BY username ASC
        LIMIT 20
      `).all() as { id: string; username: string }[];
    }
  }

  return NextResponse.json({ users });
}
