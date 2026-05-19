import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureGroupSupport } from "@/lib/group-migrations";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  // Verify ownership
  const existing = db.prepare(
    "SELECT * FROM personas WHERE id = ? AND user_id = ?"
  ).get(id, decoded.sub);

  if (!existing) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  // Deactivate all personas, then activate this one
  db.prepare("UPDATE personas SET is_active = 0 WHERE user_id = ?").run(decoded.sub);
  db.prepare("UPDATE personas SET is_active = 1 WHERE id = ?").run(id);

  const persona = db.prepare("SELECT * FROM personas WHERE id = ?").get(id);

  return NextResponse.json({ persona });
}
