import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

function parseBoundaries(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  ensureGroupSupport(db);

  const url = new URL(request.url);
  const groupId = url.searchParams.get("group_id");
  const scope = url.searchParams.get("scope");

  let universes: any[];

  if (groupId) {
    if (!isGroupMember(db, groupId, decoded.sub)) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    universes = db.prepare(
      `SELECT u.id, u.user_id, u.group_id, u.name, u.canon_mode, u.lore_source, u.tone, u.boundaries, u.created_at
       FROM universes u
       WHERE u.group_id = ?
       ORDER BY u.created_at DESC`
    ).all(groupId);
  } else if (scope === "personal") {
    // Only personal universes
    universes = db.prepare(
      `SELECT u.id, u.user_id, u.group_id, u.name, u.canon_mode, u.lore_source, u.tone, u.boundaries, u.created_at
       FROM universes u
       WHERE u.user_id = ? AND u.group_id IS NULL
       ORDER BY u.created_at DESC`
    ).all(decoded.sub);
  } else {
    // Return ALL universes the user has access to (personal + all groups)
    universes = db.prepare(
      `SELECT u.id, u.user_id, u.group_id, u.name, u.canon_mode, u.lore_source, u.tone, u.boundaries, u.created_at
       FROM universes u
       WHERE u.user_id = ? OR u.group_id IN (
         SELECT group_id FROM group_members WHERE user_id = ?
       )
       ORDER BY u.created_at DESC`
    ).all(decoded.sub, decoded.sub);
  }

  const parsed = universes.map((u) => ({
    ...u,
    boundaries: parseBoundaries(u.boundaries as string | null),
  }));

  return NextResponse.json({ universes: parsed });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { name, canon_mode = "strict", lore_source, tone, boundaries, group_id } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Universe name is required" }, { status: 400 });
  }

  const validModes = ["strict", "loose", "custom"];
  if (!validModes.includes(canon_mode)) {
    return NextResponse.json({ error: `Invalid canon_mode. Must be one of: ${validModes.join(", ")}` }, { status: 400 });
  }

  const db = getDb();
  ensureGroupSupport(db);

  if (group_id && !isGroupMember(db, group_id, decoded.sub)) {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  const id = crypto.randomUUID();

  const boundariesJson = Array.isArray(boundaries)
    ? JSON.stringify(boundaries)
    : boundaries
      ? JSON.stringify(boundaries.split("\n").map((s: string) => s.trim()).filter(Boolean))
      : null;

  db.prepare(
    "INSERT INTO universes (id, user_id, group_id, name, canon_mode, lore_source, tone, boundaries) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, decoded.sub, group_id || null, name.trim(), canon_mode, lore_source || null, tone || null, boundariesJson);

  const universe = db
    .prepare(
      "SELECT id, user_id, group_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE id = ?"
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!universe) {
    return NextResponse.json({ error: "Failed to create universe" }, { status: 500 });
  }

  const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

  return NextResponse.json({ universe: parsed }, { status: 201 });
}
