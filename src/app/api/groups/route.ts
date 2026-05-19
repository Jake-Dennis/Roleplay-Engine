import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-token";
import { ensureGroupSupport } from "@/lib/group-migrations";

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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
    `).all(decoded.sub, decoded.sub) as any[];

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
    console.error("Groups GET error:", e);
    return NextResponse.json({ error: "Failed to load groups" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const db = getDb();
    ensureGroupSupport(db);

    const id = crypto.randomUUID();

    db.prepare(
      "INSERT INTO groups (id, owner_id, name, description) VALUES (?, ?, ?, ?)"
    ).run(id, decoded.sub, name.trim(), description || null);

    // Auto-add owner as member
    db.prepare(
      "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')"
    ).run(id, decoded.sub);

    const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(id);

    return NextResponse.json({ group }, { status: 201 });
  } catch (e) {
    console.error("Groups POST error:", e);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
