import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

function parseBoundaries(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;

  const db = getDb();
  const universe = db
    .prepare(
      "SELECT id, user_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE id = ? AND user_id = ?"
    )
    .get(id, decoded.sub) as Record<string, unknown> | undefined;

  if (!universe) {
    return NextResponse.json({ error: "Universe not found" }, { status: 404 });
  }

  // Parse boundaries from JSON to array
  const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

  return NextResponse.json({ universe: parsed });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const db = getDb();

  // Verify ownership
  const existing = db
    .prepare("SELECT id FROM universes WHERE id = ? AND user_id = ?")
    .get(id, decoded.sub);

  if (!existing) {
    return NextResponse.json({ error: "Universe not found" }, { status: 404 });
  }

  const { name, canon_mode, lore_source, tone, boundaries } = body;

  // Validate name — cannot be null/empty (NOT NULL constraint)
  if (name !== undefined && (!name || !name.trim())) {
    return NextResponse.json(
      { error: "Universe name cannot be empty" },
      { status: 400 }
    );
  }

  // Validate canon_mode
  const validModes = ["strict", "loose", "custom"];
  if (canon_mode !== undefined && !validModes.includes(canon_mode)) {
    return NextResponse.json(
      { error: `Invalid canon_mode. Must be one of: ${validModes.join(", ")}` },
      { status: 400 }
    );
  }

  // Boundaries: accept array or newline-separated string, store as JSON
  let boundariesJson: string | null = null;
  if (boundaries !== undefined) {
    if (Array.isArray(boundaries)) {
      boundariesJson = boundaries.length > 0 ? JSON.stringify(boundaries) : null;
    } else if (typeof boundaries === "string") {
      const lines = boundaries.split("\n").map((s: string) => s.trim()).filter(Boolean);
      boundariesJson = lines.length > 0 ? JSON.stringify(lines) : null;
    }
  }

  // Build dynamic update — only update fields that are provided
  const updates: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { updates.push("name = ?"); values.push(name.trim()); }
  if (canon_mode !== undefined) { updates.push("canon_mode = ?"); values.push(canon_mode); }
  if (lore_source !== undefined) { updates.push("lore_source = ?"); values.push(lore_source || null); }
  if (tone !== undefined) { updates.push("tone = ?"); values.push(tone || null); }
  if (boundaries !== undefined) { updates.push("boundaries = ?"); values.push(boundariesJson); }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push(id);
  db.prepare(`UPDATE universes SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const universe = db
    .prepare(
      "SELECT id, user_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE id = ?"
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!universe) {
    return NextResponse.json({ error: "Failed to retrieve universe" }, { status: 500 });
  }

  // Return parsed boundaries
  const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

  return NextResponse.json({ universe: parsed });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;

  const db = getDb();

  // Verify ownership
  const existing = db
    .prepare("SELECT id FROM universes WHERE id = ? AND user_id = ?")
    .get(id, decoded.sub);

  if (!existing) {
    return NextResponse.json({ error: "Universe not found" }, { status: 404 });
  }

  // Check for dependent sessions
  const sessionCount = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE universe_id = ?").get(id) as { count: number };
  if (sessionCount.count > 0) {
    return NextResponse.json(
      { error: `Cannot delete universe: ${sessionCount.count} session(s) depend on it. Delete or reassign sessions first.` },
      { status: 409 }
    );
  }

  // Delete all dependent records (cascade)
  db.prepare("DELETE FROM locations WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM npcs WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM relationships WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM events WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM narrative_threads WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM lore_validations WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM backlinks WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM embedding_index WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM narrative_memories WHERE universe_id = ?").run(id);
  db.prepare("DELETE FROM job_queue WHERE universe_id = ?").run(id);

  db.prepare("DELETE FROM universes WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
