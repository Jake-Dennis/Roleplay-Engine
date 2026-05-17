import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile } from "@/lib/lore-markdown";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get("universe_id");

  const db = getDb();
  let relationships;

  if (universeId) {
    relationships = db.prepare(
      "SELECT id, user_id, universe_id, source_entity, target_entity, emotional_state, shared_history, relationship_stage, decay_rates, updated_at FROM relationships WHERE user_id = ? AND universe_id = ? ORDER BY updated_at DESC"
    ).all(decoded.sub, universeId);
  } else {
    relationships = db.prepare(
      "SELECT id, user_id, universe_id, source_entity, target_entity, emotional_state, shared_history, relationship_stage, decay_rates, updated_at FROM relationships WHERE user_id = ? ORDER BY updated_at DESC"
    ).all(decoded.sub);
  }

  return NextResponse.json({ relationships });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { sourceEntity, targetEntity, emotionalState, sharedHistory, relationshipStage, decayRates, universe_id } = body;

  if (!sourceEntity || !targetEntity) {
    return NextResponse.json({ error: "sourceEntity and targetEntity are required" }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    "INSERT INTO relationships (id, user_id, universe_id, source_entity, target_entity, emotional_state, shared_history, relationship_stage, decay_rates) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, decoded.sub, universe_id || null, sourceEntity, targetEntity,
    emotionalState ? JSON.stringify(emotionalState) : JSON.stringify({ trust: 0.5, suspicion: 0 }),
    sharedHistory ? JSON.stringify(sharedHistory) : null,
    relationshipStage || "acquaintance",
    decayRates ? JSON.stringify(decayRates) : JSON.stringify({ trust: "low", suspicion: "very_low", loyalty: "low", resentment: "very_low", attraction: "medium", respect: "low", fear: "medium" })
  );

  // Write markdown file for paired relationship directory
  const pairName = [sourceEntity, targetEntity].sort().join("_");
  const mdContent = buildMarkdown(
    { id, name: `${sourceEntity} ↔ ${targetEntity}`, type: "relationship", importance: "medium", created_at: new Date().toISOString() },
    `# ${sourceEntity} ↔ ${targetEntity}\n\n## Emotional State\n${JSON.stringify(emotionalState || { trust: 0.5 }, null, 2)}\n\n## Stage\n${relationshipStage || "acquaintance"}\n`
  );
  writeLoreFile(decoded.sub, "relationships", `${pairName}.md`, mdContent);

  const relationship = db.prepare("SELECT * FROM relationships WHERE id = ?").get(id);
  return NextResponse.json({ relationship }, { status: 201 });
}
