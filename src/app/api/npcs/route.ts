import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, deleteLoreFile, sanitizeFilename } from "@/lib/lore-markdown";
import { migrateCanonStatus, CANON_TIERS } from "@/lib/canon-tiers";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get("universe_id");

  const db = getDb();
  let npcs;

  if (universeId) {
    npcs = db
      .prepare(
        "SELECT id, user_id, universe_id, name, file_path, canon_tier, canon_layer, location_id, importance, tags, created_at FROM npcs WHERE user_id = ? AND universe_id = ? ORDER BY created_at DESC"
      )
      .all(decoded.sub, universeId);
  } else {
    npcs = db
      .prepare(
        "SELECT id, user_id, universe_id, name, file_path, canon_tier, canon_layer, location_id, importance, tags, created_at FROM npcs WHERE user_id = ? ORDER BY created_at DESC"
      )
      .all(decoded.sub);
  }

  return NextResponse.json({ npcs });
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
  const { name, file_path, canon_tier = "generated_lore", canon_layer = "generated_lore", location_id, importance = "medium", tags, universe_id } = body;

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "NPC name is required" },
      { status: 400 }
    );
  }

  // Validate canon_tier
  const validTier = CANON_TIERS.find(t => t.value === canon_tier)?.value || "generated_lore";

  const db = getDb();
  const id = crypto.randomUUID();
  const filename = file_path || sanitizeFilename(name.trim(), id);
  const tagsArray: string[] = tags || [];

  // Write markdown file
  const mdContent = buildMarkdown(
    {
      id,
      name: name.trim(),
      type: "npc",
      importance,
      canon_tier: validTier,
      tags: tagsArray,
      created_at: new Date().toISOString(),
    },
    `# ${name.trim()}\n\n## Description\n\n## Personality\n\n## History\n`
  );
  writeLoreFile(decoded.sub, "npcs", filename, mdContent);

  db.prepare(
    "INSERT INTO npcs (id, user_id, universe_id, name, file_path, canon_tier, canon_layer, location_id, importance, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    decoded.sub,
    universe_id || null,
    name.trim(),
    filename,
    validTier,
    canon_layer,
    location_id || null,
    importance,
    tags ? JSON.stringify(tags) : null
  );

  const npc = db
    .prepare(
      "SELECT id, user_id, universe_id, name, file_path, canon_tier, canon_layer, location_id, importance, tags, created_at FROM npcs WHERE id = ?"
    )
    .get(id);

  return NextResponse.json({ npc }, { status: 201 });
}
