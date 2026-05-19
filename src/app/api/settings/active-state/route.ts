import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";

export async function PUT(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    const headerToken = request.headers.get("x-auth-token");
    if (!headerToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    var authToken = headerToken;
  } else {
    var authToken = token;
  }

  const decoded = await verifyToken(authToken);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { groupId, sessionId, universeId } = body;

  const db = getDb();
  ensureGroupSupport(db);

  // Build dynamic update — only touch fields that were provided
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if ("groupId" in body) {
    updates.push("last_active_group_id = ?");
    values.push(groupId || null);
  }
  if ("sessionId" in body) {
    updates.push("last_active_session_id = ?");
    values.push(sessionId || null);
  }
  if ("universeId" in body) {
    updates.push("last_active_universe_id = ?");
    values.push(universeId || null);
  }

  if (updates.length === 0) {
    return NextResponse.json({ success: true });
  }

  values.push(decoded.sub);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  return NextResponse.json({ success: true });
}
