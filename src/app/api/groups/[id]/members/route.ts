import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-token";
import { ensureGroupSupport, isGroupOwner } from "@/lib/group-migrations";
import { validateLength } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: groupId } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  if (!isGroupOwner(db, groupId, decoded.sub)) {
    return NextResponse.json({ error: "Not owner" }, { status: 403 });
  }

    requireJson(request);
    const body = await request.json();
  const { username, user_id } = body;

  if (username !== undefined) {
    const usernameError = validateLength(username, 50, "Username");
    if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
  }

  let targetUserId: string;

  if (user_id) {
    targetUserId = user_id;
  } else if (username && username.trim()) {
    const user = db.prepare(
      "SELECT id FROM users WHERE username = ?"
    ).get(username.trim()) as { id: string } | undefined;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    targetUserId = user.id;
  } else {
    return NextResponse.json({ error: "Username or user_id is required" }, { status: 400 });
  }

  const existing = db.prepare(
    "SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?"
  ).get(groupId, targetUserId);

  if (existing) {
    return NextResponse.json({ error: "User is already a member" }, { status: 409 });
  }

  db.prepare(
    "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')"
  ).run(groupId, targetUserId);

  return NextResponse.json({ success: true, userId: targetUserId });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: groupId } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  if (!isGroupOwner(db, groupId, decoded.sub)) {
    return NextResponse.json({ error: "Not owner" }, { status: 403 });
  }

    requireJson(request);
    const body = await request.json();
  const { user_id } = body;

  if (!user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const group = db.prepare(
    "SELECT owner_id FROM groups WHERE id = ?"
  ).get(groupId) as { owner_id: string } | undefined;

  if (group?.owner_id === user_id) {
    return NextResponse.json({ error: "Cannot remove owner" }, { status: 400 });
  }

  db.prepare(
    "DELETE FROM group_members WHERE group_id = ? AND user_id = ?"
  ).run(groupId, user_id);

  return NextResponse.json({ success: true });
}
