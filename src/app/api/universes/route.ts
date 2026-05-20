import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";
import type { DbResult } from "@/lib/types";
import { forbiddenError, badRequestError, internalError, requireJson } from "@/lib/error-response";
import { validateLength } from "@/lib/validation";
import { parseBoundaries } from '@/lib/universe-utils';

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const db = getDb();
  ensureGroupSupport(db);

  const url = new URL(request.url);
  const groupId = url.searchParams.get("group_id");
  const scope = url.searchParams.get("scope");

  let universes: DbResult[];

  if (groupId) {
    if (!isGroupMember(db, groupId, userId)) {
      return forbiddenError();
    }
    universes = db.prepare(
      `SELECT u.id, u.user_id, u.group_id, u.name, u.canon_mode, u.lore_source, u.tone, u.boundaries, u.created_at
       FROM universes u
       WHERE u.group_id = ?
       ORDER BY u.created_at DESC`
    ).all(groupId) as DbResult[];
  } else if (scope === "personal") {
    // Only personal universes
    universes = db.prepare(
      `SELECT u.id, u.user_id, u.group_id, u.name, u.canon_mode, u.lore_source, u.tone, u.boundaries, u.created_at
       FROM universes u
       WHERE u.user_id = ? AND u.group_id IS NULL
       ORDER BY u.created_at DESC`
    ).all(userId) as DbResult[];
  } else {
    // Return ALL universes the user has access to (personal + all groups)
    universes = db.prepare(
      `SELECT u.id, u.user_id, u.group_id, u.name, u.canon_mode, u.lore_source, u.tone, u.boundaries, u.created_at
       FROM universes u
       WHERE u.user_id = ? OR u.group_id IN (
         SELECT group_id FROM group_members WHERE user_id = ?
       )
       ORDER BY u.created_at DESC`
    ).all(userId, userId) as DbResult[];
  }

  const parsed = universes.map((u) => ({
    ...u,
    boundaries: parseBoundaries(u.boundaries as string | null),
  }));

  return NextResponse.json({ universes: camelizeKeys(parsed) });
}

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

    requireJson(request);
    const body = await request.json();
  const { name, canon_mode = "strict", lore_source, tone, boundaries, group_id } = body;

  if (!name || !name.trim()) {
    return badRequestError("Universe name is required");
  }

  const nameError = validateLength(name, 200, "Name");
  if (nameError) return badRequestError(nameError);

  const validModes = ["strict", "loose", "custom"];
  if (!validModes.includes(canon_mode)) {
    return badRequestError(`Invalid canon_mode. Must be one of: ${validModes.join(", ")}`);
  }

  const db = getDb();
  ensureGroupSupport(db);

  if (group_id && !isGroupMember(db, group_id, userId)) {
    return forbiddenError();
  }

  const id = crypto.randomUUID();

  const boundariesJson = Array.isArray(boundaries)
    ? JSON.stringify(boundaries)
    : boundaries
      ? JSON.stringify(boundaries.split("\n").map((s: string) => s.trim()).filter(Boolean))
      : null;

  db.prepare(
    "INSERT INTO universes (id, user_id, group_id, name, canon_mode, lore_source, tone, boundaries) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, group_id || null, name.trim(), canon_mode, lore_source || null, tone || null, boundariesJson);

  const universe = db
    .prepare(
      "SELECT id, user_id, group_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE id = ?"
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!universe) {
    return internalError();
  }

  const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

  return NextResponse.json({ universe: camelizeKeys(parsed) }, { status: 201 });
}
