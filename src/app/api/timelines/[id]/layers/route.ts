import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

const VALID_LAYER_TYPES = ["era", "faction", "active_characters"] as const;

function rowToJson(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    timeline_id: row.timeline_id,
    universe_id: row.universe_id,
    layer_type: row.layer_type,
    name: row.name,
    description: row.description,
    start_year: row.start_year,
    end_year: row.end_year,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    created_at: row.created_at,
  };
}

// GET /api/timelines/[id]/layers — list layers for a timeline
// GET /api/timelines/[id]/layers?layerType=era — filter by type
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: timelineId } = await params;
  const { searchParams } = new URL(request.url);
  const layerType = searchParams.get("layerType");

  const db = getDb();

  // Verify timeline ownership
  const timeline = db.prepare(
    "SELECT id FROM timelines WHERE id = ? AND user_id = ?"
  ).get(timelineId, decoded.sub) as { id: string } | undefined;
  if (!timeline) {
    return NextResponse.json({ error: "Timeline not found" }, { status: 404 });
  }

  let query = "SELECT * FROM timeline_layers WHERE timeline_id = ? AND user_id = ?";
  const queryParams: any[] = [timelineId, decoded.sub];

  if (layerType && VALID_LAYER_TYPES.includes(layerType as any)) {
    query += " AND layer_type = ?";
    queryParams.push(layerType);
  }

  query += " ORDER BY created_at DESC";

  const rows = db.prepare(query).all(...queryParams);
  const layers = rows.map(rowToJson);

  return NextResponse.json({ layers });
}

// POST /api/timelines/[id]/layers — create a new layer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: timelineId } = await params;
  const body = await request.json();
  const { layerType, name, description, startYear, endYear, metadata } = body;

  if (!layerType || !VALID_LAYER_TYPES.includes(layerType)) {
    return NextResponse.json(
      { error: `Invalid layer_type. Must be one of: ${VALID_LAYER_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: "name must be 200 characters or less" }, { status: 400 });
  }

  const db = getDb();

  // Verify timeline ownership
  const timeline = db.prepare(
    "SELECT id, universe_id FROM timelines WHERE id = ? AND user_id = ?"
  ).get(timelineId, decoded.sub) as { id: string; universe_id: string | null } | undefined;
  if (!timeline) {
    return NextResponse.json({ error: "Timeline not found" }, { status: 404 });
  }

  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO timeline_layers (id, user_id, timeline_id, universe_id, layer_type, name, description, start_year, end_year, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    decoded.sub,
    timelineId,
    timeline.universe_id || null,
    layerType,
    name.trim(),
    description || null,
    startYear || null,
    endYear || null,
    metadata ? JSON.stringify(metadata) : null
  );

  const row = db.prepare("SELECT * FROM timeline_layers WHERE id = ?").get(id);
  return NextResponse.json({ layer: rowToJson(row) }, { status: 201 });
}
