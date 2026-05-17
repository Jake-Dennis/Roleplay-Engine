import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

function parseBoundaries(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    // Stored as plain text, one per line
    return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  }
}

function formatBoundaries(raw: string | null): string | null {
  if (!raw) return null;
  try {
    // Already JSON, return as-is
    JSON.parse(raw);
    return raw;
  } catch {
    // Plain text, convert to JSON array
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    return lines.length > 0 ? JSON.stringify(lines) : null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getDb();
  const universes = db
    .prepare(
      "SELECT id, user_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(decoded.sub);

  // Parse boundaries from JSON to array for client consumption
  const parsed = (universes as Record<string, unknown>[]).map((u) => ({
    ...u,
    boundaries: parseBoundaries(u.boundaries as string | null),
  }));

  return NextResponse.json({ universes: parsed });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json();
  const { name, canon_mode = "strict", lore_source, tone, boundaries } = body;

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "Universe name is required" },
      { status: 400 }
    );
  }

  // Validate canon_mode
  const validModes = ["strict", "loose", "custom"];
  if (!validModes.includes(canon_mode)) {
    return NextResponse.json(
      { error: `Invalid canon_mode. Must be one of: ${validModes.join(", ")}` },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = crypto.randomUUID();

  // Boundaries: accept array or newline-separated string, store as JSON
  const boundariesJson = Array.isArray(boundaries)
    ? JSON.stringify(boundaries)
    : boundaries
      ? JSON.stringify(boundaries.split("\n").map((s: string) => s.trim()).filter(Boolean))
      : null;

  db.prepare(
    "INSERT INTO universes (id, user_id, name, canon_mode, lore_source, tone, boundaries) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, decoded.sub, name.trim(), canon_mode, lore_source || null, tone || null, boundariesJson);

  const universe = db
    .prepare(
      "SELECT id, user_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE id = ?"
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!universe) {
    return NextResponse.json({ error: "Failed to create universe" }, { status: 500 });
  }

  // Return parsed boundaries
  const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

  return NextResponse.json({ universe: parsed }, { status: 201 });
}
