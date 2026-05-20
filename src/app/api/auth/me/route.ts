import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { getAuthToken } from '@/lib/auth-token';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const decoded = await verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const user = getUserById(decoded.sub);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch active state from DB
  const db = getDb();
  ensureGroupSupport(db);
  const activeState = db.prepare(
    "SELECT last_active_group_id, last_active_session_id, last_active_universe_id FROM users WHERE id = ?"
  ).get(decoded.sub) as {
    last_active_group_id: string | null;
    last_active_session_id: string | null;
    last_active_universe_id: string | null;
  } | undefined;

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      createdAt: user.created_at,
    },
    activeState: {
      groupId: activeState?.last_active_group_id || null,
      sessionId: activeState?.last_active_session_id || null,
      universeId: activeState?.last_active_universe_id || null,
    },
  });
}
