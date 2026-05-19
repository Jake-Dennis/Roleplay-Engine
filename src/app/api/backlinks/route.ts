import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import type { DbParams } from "@/lib/types";

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const targetType = searchParams.get("targetType");
  const universeId = searchParams.get("universe_id");

  const db = getDb();
  let backlinks;

  if (entityType && entityId) {
    // Get backlinks pointing TO this entity
    let query = "SELECT id, user_id, universe_id, source_type, source_id, target_type, target_id, link_type, context_snippet, created_at FROM backlinks WHERE target_type = ? AND target_id = ?";
    const params: DbParams = [entityType, entityId];
    if (universeId) {
      query += " AND universe_id = ?";
      params.push(universeId);
    }
    query += " ORDER BY created_at DESC";
    backlinks = db.prepare(query).all(...params);
  } else if (targetType) {
    // Get all backlinks of a specific target type
    let query = "SELECT id, user_id, universe_id, source_type, source_id, target_type, target_id, link_type, context_snippet, created_at FROM backlinks WHERE user_id = ? AND target_type = ?";
    const params: DbParams = [userId, targetType];
    if (universeId) {
      query += " AND universe_id = ?";
      params.push(universeId);
    }
    query += " ORDER BY created_at DESC LIMIT 100";
    backlinks = db.prepare(query).all(...params);
  } else {
    // Get all recent backlinks (with limit)
    let query = "SELECT id, user_id, universe_id, source_type, source_id, target_type, target_id, link_type, context_snippet, created_at FROM backlinks WHERE user_id = ?";
    const params: DbParams = [userId];
    if (universeId) {
      query += " AND universe_id = ?";
      params.push(universeId);
    }
    query += " ORDER BY created_at DESC LIMIT 100";
    backlinks = db.prepare(query).all(...params);
  }

  return NextResponse.json({ backlinks });
}

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

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
  return NextResponse.json({ backlink }, { status: 201 });
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
