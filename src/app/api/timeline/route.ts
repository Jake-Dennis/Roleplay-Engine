import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { rowToJson } from "@/lib/row-to-json";
import type { DbParams, PaginatedRow } from "@/lib/types";

const VALID_ENTRY_TYPES = ["event", "milestone", "era_start", "era_end", "note"];
const VALID_IMPORTANCE = ["low", "medium", "high", "critical"];

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const sessionId = searchParams.get("sessionId");
  const threadId = searchParams.get("threadId");
  const era = searchParams.get("era");
  const entryType = searchParams.get("entryType");
  const sortOrder = searchParams.get("sort") || "desc"; // "asc" or "desc"
  const limitParam = searchParams.get("limit");
  const cursor = searchParams.get("cursor");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 200;

  const db = getDb();

  // Single entry lookup
  if (id) {
    const row = db.prepare(
      "SELECT * FROM timeline_entries WHERE id = ? AND user_id = ?"
    ).get(id, userId);
    if (!row) return NextResponse.json({ error: "Timeline entry not found" }, { status: 404 });
    return NextResponse.json({ entry: rowToJson(row) });
  }

  // List entries with filters
  let query = "SELECT * FROM timeline_entries WHERE user_id = ?";
  const params: DbParams = [userId];

  if (sessionId) {
    query += " AND session_id = ?";
    params.push(sessionId);
  }
  if (threadId) {
    query += " AND thread_id = ?";
    params.push(threadId);
  }
  if (era) {
    query += " AND era = ?";
    params.push(era);
  }
  if (entryType) {
    query += " AND entry_type = ?";
    params.push(entryType);
  }

  // Cursor-based pagination
  if (cursor) {
    const cursorEntry = db.prepare(
      "SELECT occurred_at FROM timeline_entries WHERE id = ? AND user_id = ?"
    ).get(cursor, userId) as { occurred_at: string } | undefined;

    if (cursorEntry) {
      if (sortOrder === "asc") {
        query += " AND (occurred_at, id) > (?, ?)";
        params.push(cursorEntry.occurred_at, cursor);
      } else {
        query += " AND (occurred_at, id) < (?, ?)";
        params.push(cursorEntry.occurred_at, cursor);
      }
    }
  }

  const order = sortOrder === "asc" ? "ASC" : "DESC";
  const idOrder = sortOrder === "asc" ? "ASC" : "DESC";
  query += ` ORDER BY occurred_at ${order}, id ${idOrder} LIMIT ?`;
  params.push(limit + 1);

  const rows = db.prepare(query).all(...params) as PaginatedRow[];

  let nextCursor: string | null = null;
  let resultEntries = rows;
  if (rows.length > limit) {
    nextCursor = rows[limit].id;
    resultEntries = rows.slice(0, limit);
  }

  const entries = resultEntries.map(rowToJson);
  return NextResponse.json({ entries, nextCursor });
}

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

    requireJson(request);
    const body = await request.json();
  const { title, description, sessionId, threadId, occurredAt, era, entryType, importance } = body;

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
  }
  if (!occurredAt) {
    return NextResponse.json({ error: "occurredAt is required" }, { status: 400 });
  }
  if (description && description.length > 5000) {
    return NextResponse.json({ error: "description must be 5000 characters or less" }, { status: 400 });
  }
  if (entryType && !VALID_ENTRY_TYPES.includes(entryType)) {
    return NextResponse.json({ error: `Invalid entry_type. Must be one of: ${VALID_ENTRY_TYPES.join(", ")}` }, { status: 400 });
  }
  if (importance && !VALID_IMPORTANCE.includes(importance)) {
    return NextResponse.json({ error: `Invalid importance. Must be one of: ${VALID_IMPORTANCE.join(", ")}` }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO timeline_entries (id, user_id, session_id, thread_id, title, description, occurred_at, era, entry_type, importance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    sessionId || null,
    threadId || null,
    title.trim(),
    description || null,
    occurredAt,
    era || null,
    entryType || "event",
    importance || "medium"
  );

  const row = db.prepare("SELECT * FROM timeline_entries WHERE id = ?").get(id);
  return NextResponse.json({ entry: rowToJson(row) }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

    requireJson(request);
    const body = await request.json();
  const { id, title, description, occurredAt, era, entryType, importance } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM timeline_entries WHERE id = ? AND user_id = ?"
  ).get(id, userId);
  if (!existing) return NextResponse.json({ error: "Timeline entry not found" }, { status: 404 });

  if (title !== undefined) {
    if (title.trim().length === 0) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
  }
  if (description !== undefined && description.length > 5000) {
    return NextResponse.json({ error: "description must be 5000 characters or less" }, { status: 400 });
  }
  if (entryType !== undefined && !VALID_ENTRY_TYPES.includes(entryType)) {
    return NextResponse.json({ error: `Invalid entry_type. Must be one of: ${VALID_ENTRY_TYPES.join(", ")}` }, { status: 400 });
  }
  if (importance !== undefined && !VALID_IMPORTANCE.includes(importance)) {
    return NextResponse.json({ error: `Invalid importance. Must be one of: ${VALID_IMPORTANCE.join(", ")}` }, { status: 400 });
  }

  db.prepare(
    `UPDATE timeline_entries SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       occurred_at = COALESCE(?, occurred_at),
       era = COALESCE(?, era),
       entry_type = COALESCE(?, entry_type),
       importance = COALESCE(?, importance)
     WHERE id = ? AND user_id = ?`
  ).run(
    title?.trim() ?? null,
    description ?? null,
    occurredAt ?? null,
    era ?? null,
    entryType ?? null,
    importance ?? null,
    id,
    userId
  );

  const row = db.prepare("SELECT * FROM timeline_entries WHERE id = ?").get(id);
  return NextResponse.json({ entry: rowToJson(row) });
}

export async function DELETE(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM timeline_entries WHERE id = ? AND user_id = ?"
  ).get(id, userId);
  if (!existing) return NextResponse.json({ error: "Timeline entry not found" }, { status: 404 });

  db.prepare("DELETE FROM timeline_entries WHERE id = ? AND user_id = ?").run(id, userId);
  return NextResponse.json({ success: true });
}
