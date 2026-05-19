import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { rowToJson } from "@/lib/row-to-json";

// PUT /api/timelines/[id]/layers/[layerId] — update a layer
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; layerId: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: timelineId, layerId } = await params;
  const body = await request.json();
  const { name, description, startYear, endYear, metadata } = body;

  const db = getDb();

  // Verify ownership
  const existing = db.prepare(
    "SELECT * FROM timeline_layers WHERE id = ? AND timeline_id = ? AND user_id = ?"
  ).get(layerId, timelineId, decoded.sub);
  if (!existing) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 });
  }

  if (name !== undefined) {
    if (name.trim().length === 0) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    if (name.length > 200) return NextResponse.json({ error: "name must be 200 characters or less" }, { status: 400 });
  }

  db.prepare(
    `UPDATE timeline_layers SET
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       start_year = COALESCE(?, start_year),
       end_year = COALESCE(?, end_year),
       metadata = COALESCE(?, metadata)
     WHERE id = ? AND user_id = ?`
  ).run(
    name?.trim() ?? null,
    description ?? null,
    startYear ?? null,
    endYear ?? null,
    metadata !== undefined ? JSON.stringify(metadata) : null,
    layerId,
    decoded.sub
  );

  const row = db.prepare("SELECT * FROM timeline_layers WHERE id = ?").get(layerId);
  return NextResponse.json({ layer: rowToJson(row) });
}

// DELETE /api/timelines/[id]/layers/[layerId] — delete a layer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; layerId: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: timelineId, layerId } = await params;

  const db = getDb();

  const existing = db.prepare(
    "SELECT id FROM timeline_layers WHERE id = ? AND timeline_id = ? AND user_id = ?"
  ).get(layerId, timelineId, decoded.sub);
  if (!existing) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 });
  }

  db.prepare(
    "DELETE FROM timeline_layers WHERE id = ? AND user_id = ?"
  ).run(layerId, decoded.sub);

  return NextResponse.json({ success: true });
}
