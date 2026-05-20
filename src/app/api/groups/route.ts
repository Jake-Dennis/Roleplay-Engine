import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { ensureGroupSupport } from "@/lib/group-migrations";
import type { DbRow } from "@/lib/types";
import { badRequestError, internalError } from "@/lib/error-response";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  try {
    const db = getDb();
    ensureGroupSupport(db);

    // Get groups the user owns or is a member of
    const groups = db.prepare(`
      SELECT g.id, g.owner_id, g.name, g.description, g.created_at,
        u.username as owner_name
      FROM groups g
      JOIN users u ON g.owner_id = u.id
      WHERE g.owner_id = ? OR g.id IN (
        SELECT group_id FROM group_members WHERE user_id = ?
      )
      ORDER BY g.created_at DESC
    `).all(userId, userId) as DbRow[];

    // Get counts separately to avoid subquery issues
    const result = groups.map((g) => {
      const memberCount = db.prepare(
        "SELECT COUNT(*) as c FROM group_members WHERE group_id = ?"
      ).get(g.id) as { c: number };
      const sessionCount = db.prepare(
        "SELECT COUNT(*) as c FROM sessions WHERE group_id = ?"
      ).get(g.id) as { c: number };
      const universeCount = db.prepare(
        "SELECT COUNT(*) as c FROM universes WHERE group_id = ?"
      ).get(g.id) as { c: number };

      return {
        ...g,
        member_count: memberCount.c,
        session_count: sessionCount.c,
        universe_count: universeCount.c,
      };
    });

    return NextResponse.json({ groups: result });
  } catch (e) {
    logger.error("Groups GET error:", e);
    return internalError();
  }
}

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return badRequestError("Group name is required");
    }

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

    return NextResponse.json({ group }, { status: 201 });
  } catch (e) {
    logger.error("Groups POST error:", e);
    return internalError();
  }
}
