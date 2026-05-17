import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMarkdown, writeLoreFile, sanitizeFilename } from "@/lib/lore-markdown";


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
  let locations;

  if (universeId) {
    locations = db
      .prepare(
        "SELECT id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, created_at FROM locations WHERE user_id = ? AND universe_id = ? ORDER BY created_at DESC"
      )
      .all(decoded.sub, universeId);
  } else {
    locations = db
      .prepare(
        "SELECT id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, created_at FROM locations WHERE user_id = ? ORDER BY created_at DESC"
      )
      .all(decoded.sub);
  }

  return NextResponse.json({ locations });
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
  const { name, file_path, importance = "medium", canon_layer = "generated_lore", parent_location_id, known_info, hidden_info, universe_id } = body;

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "Location name is required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const filename = file_path || sanitizeFilename(name.trim(), id);

  // Write markdown file
  const mdContent = buildMarkdown(
    {
      id,
      name: name.trim(),
      type: "location",
      importance,
      parent_id: parent_location_id || null,
      created_at: new Date().toISOString(),
    },
    `# ${name.trim()}\n\n${known_info ? `Known: ${typeof known_info === 'string' ? known_info : JSON.stringify(known_info)}` : ""}`
  );
  writeLoreFile(decoded.sub, "locations", filename, mdContent);

  db.prepare(
    "INSERT INTO locations (id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    decoded.sub,
    universe_id || null,
    name.trim(),
    filename,
    importance,
    canon_layer,
    parent_location_id || null,
    known_info ? JSON.stringify(known_info) : null,
    hidden_info ? JSON.stringify(hidden_info) : null
  );

  const location = db
    .prepare(
      "SELECT id, user_id, universe_id, name, file_path, importance, canon_layer, parent_location_id, known_info, hidden_info, created_at FROM locations WHERE id = ?"
    )
    .get(id);

  return NextResponse.json({ location }, { status: 201 });
}
