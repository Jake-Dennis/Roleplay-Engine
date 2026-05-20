import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import type { DbParams, PaginatedRow } from "@/lib/types";

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const targetType = searchParams.get("targetType");
  const universeId = searchParams.get("universe_id");
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;

  const db = getDb();

  // Build base query parts
  let whereClauses: string[] = ["user_id = ?"];
  const params: DbParams = [userId];

  if (entityType && entityId) {
    whereClauses = ["target_type = ?", "target_id = ?"];
    params.length = 0;
    params.push(entityType, entityId);
  }
  if (targetType && !entityType) {
    whereClauses.push("target_type = ?");
    params.push(targetType);
  }
  if (universeId) {
    whereClauses.push("universe_id = ?");
    params.push(universeId);
  }

  // Cursor pagination
  if (cursor) {
    const cursorRow = db.prepare(
      "SELECT created_at FROM backlinks WHERE id = ? AND user_id = ?"
    ).get(cursor, userId) as { created_at: string } | undefined;

    if (cursorRow) {
      whereClauses.push("(created_at, id) < (?, ?)");
      params.push(cursorRow.created_at, cursor);
    }
  }

  const where = whereClauses.join(" AND ");
  const query = `SELECT id, user_id, universe_id, source_type, source_id, target_type, target_id, link_type, context_snippet, created_at FROM backlinks WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`;
  params.push(limit + 1);

  const rows = db.prepare(query).all(...params) as PaginatedRow[];

  let nextCursor: string | null = null;
  let resultItems = rows;
  if (rows.length > limit) {
    nextCursor = rows[limit].id;
    resultItems = rows.slice(0, limit);
  }

  return NextResponse.json({ backlinks: camelizeKeys(resultItems), nextCursor });
}

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

    requireJson(request);
    const body = await request.json();
  const { sourceType, sourceId, targetType, targetId, linkType, contextSnippet, universe_id } = body;

  if (!sourceType || !sourceId || !targetType || !targetId) {
    return NextResponse.json({ error: "sourceType, sourceId, targetType, targetId are required" }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();

  try {
    db.prepare(
      "INSERT INTO backlinks (id, user_id, universe_id, source_type, source_id, target_type, target_id, link_type, context_snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, userId, universe_id || null, sourceType, sourceId, targetType, targetId, linkType || "mentions", contextSnippet || null);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Backlink already exists" }, { status: 409 });
    }
    throw err;
  }

  const backlink = db.prepare("SELECT * FROM backlinks WHERE id = ?").get(id);
  return NextResponse.json({ backlink: camelizeKeys(backlink) }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Backlink id is required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM backlinks WHERE id = ? AND user_id = ?").run(id, userId);
  return NextResponse.json({ success: true });
}
