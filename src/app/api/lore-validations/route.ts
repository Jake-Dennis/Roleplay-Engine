import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const state = searchParams.get("state");
  const universeId = searchParams.get("universe_id");

  const db = getDb();
  let conditions = "WHERE user_id = ?";
  const params: any[] = [decoded.sub];

  if (universeId) { conditions += " AND universe_id = ?"; params.push(universeId); }
  if (entityType) { conditions += " AND entity_type = ?"; params.push(entityType); }
  if (entityId) { conditions += " AND entity_id = ?"; params.push(entityId); }
  if (state) { conditions += " AND state = ?"; params.push(state); }

  const validations = db.prepare(
    `SELECT id, user_id, universe_id, entity_type, entity_id, state, validation_notes, generated_by, validated_by, validated_at, created_at FROM lore_validations ${conditions} ORDER BY created_at DESC LIMIT 50`
  ).all(...params);

  return NextResponse.json({ validations });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { entityType, entityId, state, validationNotes, generatedBy, universe_id } = body;

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const validState = ["generated_unverified", "under_review", "validated", "rejected"].includes(state) ? state : "generated_unverified";

  db.prepare(
    "INSERT INTO lore_validations (id, user_id, universe_id, entity_type, entity_id, state, validation_notes, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, decoded.sub, universe_id || null, entityType, entityId, validState, validationNotes || null, generatedBy || "system");

  const validation = db.prepare("SELECT * FROM lore_validations WHERE id = ?").get(id);
  return NextResponse.json({ validation }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { entityType, entityId, state, validationNotes } = body;

  if (!entityType || !entityId || !state) {
    return NextResponse.json({ error: "entityType, entityId, and state are required" }, { status: 400 });
  }

  const validState = ["generated_unverified", "under_review", "validated", "rejected"].includes(state) ? state : "generated_unverified";

  const db = getDb();
  const existing = db.prepare(
    "SELECT id FROM lore_validations WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
  ).get(decoded.sub, entityType, entityId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE lore_validations SET state = ?, validation_notes = COALESCE(?, validation_notes), validated_by = ?, validated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(validState, validationNotes || null, decoded.sub, existing.id);
  } else {
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, validation_notes, validated_by, validated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).run(id, decoded.sub, entityType, entityId, validState, validationNotes || null, decoded.sub);
  }

  const validation = existing
    ? db.prepare("SELECT * FROM lore_validations WHERE id = ?").get(existing.id)
    : null;

  return NextResponse.json({ success: true, validation });
}
