import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import fs from "fs";
import path from "path";
import { APP_CONFIG } from "@/lib/config";
import { parseWikilinks, parseFrontmatter, syncFrontmatterToDb } from "@/lib/lore-markdown";

const LORE_TYPES = ["locations", "npcs", "events", "relationships"] as const;
type LoreType = (typeof LORE_TYPES)[number];

function getUserLoreDir(userId: string, type: LoreType): string {
  return path.join(APP_CONFIG.dataDir, userId, type);
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType") as LoreType | null;
  const entityId = searchParams.get("entityId");
  const universeId = searchParams.get("universe_id");

  const db = getDb();

  // List all lore files for a user
  if (!entityType && !entityId) {
    const allFiles: { type: LoreType; id: string; name: string; content: string; wikilinks: string[]; universe_id: string | null }[] = [];

    for (const type of LORE_TYPES) {
      const dir = getUserLoreDir(decoded.sub, type);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        const { frontmatter } = parseFrontmatter(content);
        const wikilinks = parseWikilinks(content).map((w) => w.name);

        // Get universe_id from DB
        let universe_id: string | null = null;
        if (type === "locations") {
          const row = db.prepare("SELECT universe_id FROM locations WHERE id = ? AND user_id = ?").get(frontmatter.id, decoded.sub) as { universe_id: string | null } | undefined;
          universe_id = row?.universe_id || null;
        } else if (type === "npcs") {
          const row = db.prepare("SELECT universe_id FROM npcs WHERE id = ? AND user_id = ?").get(frontmatter.id, decoded.sub) as { universe_id: string | null } | undefined;
          universe_id = row?.universe_id || null;
        }

        // Filter by universe if provided
        if (universeId && universe_id !== universeId) continue;

        allFiles.push({
          type,
          id: frontmatter.id || file.replace(".md", ""),
          name: frontmatter.name || file.replace(".md", ""),
          content,
          wikilinks,
          universe_id,
        });
      }
    }

    return NextResponse.json({ files: allFiles });
  }

  // Get specific entity's lore file
  if (entityId && entityType) {
    // First get entity info from DB
    let entity: any = null;
    if (entityType === "locations") {
      entity = db.prepare("SELECT id, universe_id, name, file_path FROM locations WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
    } else if (entityType === "npcs") {
      entity = db.prepare("SELECT id, universe_id, name, file_path FROM npcs WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
    } else if (entityType === "events") {
      entity = db.prepare("SELECT id, universe_id, title as name, file_path FROM events WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
    } else if (entityType === "relationships") {
      entity = db.prepare("SELECT id, universe_id, name, file_path FROM relationships WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
    }

    if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

    // Verify universe match if provided
    if (universeId && entity.universe_id !== universeId) {
      return NextResponse.json({ error: "Entity not found in this universe" }, { status: 404 });
    }

    // Try to find the file
    const dir = getUserLoreDir(decoded.sub, entityType);
    if (!fs.existsSync(dir)) return NextResponse.json({ error: "Lore file not found" }, { status: 404 });

    // Find the file by entity ID in frontmatter
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    let foundFile: string | null = null;
    let content = "";

    for (const file of files) {
      const fileContent = fs.readFileSync(path.join(dir, file), "utf-8");
      const { frontmatter } = parseFrontmatter(fileContent);
      if (frontmatter.id === entityId) {
        foundFile = file;
        content = fileContent;
        break;
      }
    }

    if (!foundFile) return NextResponse.json({ error: "Lore file not found" }, { status: 404 });

    const { frontmatter, body } = parseFrontmatter(content);
    const wikilinks = parseWikilinks(content);

    return NextResponse.json({
      file: {
        type: entityType,
        id: entityId,
        name: entity.name,
        universe_id: entity.universe_id,
        frontmatter,
        body,
        content,
        wikilinks,
      },
    });
  }

  return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
}

export async function PUT(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { entityType, entityId, content } = body;

  if (!entityType || !LORE_TYPES.includes(entityType as LoreType)) {
    return NextResponse.json({ error: "Valid entityType is required" }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId is required" }, { status: 400 });
  }
  if (content === undefined) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Verify entity ownership and canon tier (D2: immutable canon enforcement)
  const db = getDb();
  let entity: any = null;
  if (entityType === "locations") {
    entity = db.prepare("SELECT id, universe_id, name, canon_tier FROM locations WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  } else if (entityType === "npcs") {
    entity = db.prepare("SELECT id, universe_id, name, canon_tier FROM npcs WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  } else if (entityType === "events") {
    entity = db.prepare("SELECT id, universe_id, title as name, canon_tier FROM events WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  } else if (entityType === "relationships") {
    entity = db.prepare("SELECT id, universe_id, name, canon_tier FROM relationships WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  }

  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  // D2: Block edits to immutable canon entities
  if (entity.canon_tier === "immutable_canon") {
    return NextResponse.json({ error: "Cannot edit immutable canon entity" }, { status: 403 });
  }

  // Write the file
  const dir = getUserLoreDir(decoded.sub, entityType as LoreType);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Find existing file or create new one
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  let existingFile: string | null = null;

  for (const file of files) {
    const fileContent = fs.readFileSync(path.join(dir, file), "utf-8");
    const { frontmatter } = parseFrontmatter(fileContent);
    if (frontmatter.id === entityId) {
      existingFile = file;
      break;
    }
  }

  const filename = existingFile || `${entityId}.md`;
  const filePath = path.join(dir, filename);

  // Read existing content before overwriting
  let oldContent: string | null = null;
  if (fs.existsSync(filePath)) {
    oldContent = fs.readFileSync(filePath, "utf-8");
  }

  // Write new content
  fs.writeFileSync(filePath, content, "utf-8");

  // Sync frontmatter to database (DB is source of truth, frontmatter fields merge into DB)
  try {
    syncFrontmatterToDb(decoded.sub, entityType as LoreType, entityId, filePath);
  } catch {
    // File I/O errors should not break API responses
  }

  // Record edit if content changed
  if (oldContent && oldContent !== content) {
    db.prepare(
      "INSERT INTO lore_edits (id, user_id, entity_type, entity_id, old_content, new_content) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), decoded.sub, entityType, entityId, oldContent, content);
  }

  // Parse and return wikilinks for validation
  const wikilinks = parseWikilinks(content);

  return NextResponse.json({
    success: true,
    file: filename,
    wikilinks: wikilinks.map((w) => w.name),
  });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType") as LoreType | null;
  const entityId = searchParams.get("entityId");

  if (!entityType || !LORE_TYPES.includes(entityType as LoreType)) {
    return NextResponse.json({ error: "Valid entityType is required" }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId is required" }, { status: 400 });
  }

  // D2: Verify entity ownership and canon tier
  const db = getDb();
  let entity: any = null;
  if (entityType === "locations") {
    entity = db.prepare("SELECT id, universe_id, name, canon_tier FROM locations WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  } else if (entityType === "npcs") {
    entity = db.prepare("SELECT id, universe_id, name, canon_tier FROM npcs WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  } else if (entityType === "events") {
    entity = db.prepare("SELECT id, universe_id, title as name, canon_tier FROM events WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  } else if (entityType === "relationships") {
    entity = db.prepare("SELECT id, universe_id, name, canon_tier FROM relationships WHERE id = ? AND user_id = ?").get(entityId, decoded.sub);
  }

  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  // D2: Block deletion of immutable canon entities
  if (entity.canon_tier === "immutable_canon") {
    return NextResponse.json({ error: "Cannot delete immutable canon entity" }, { status: 403 });
  }

  // Delete the file
  const dir = getUserLoreDir(decoded.sub, entityType as LoreType);
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ error: "Lore file not found" }, { status: 404 });
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  let foundFile: string | null = null;

  for (const file of files) {
    const fileContent = fs.readFileSync(path.join(dir, file), "utf-8");
    const { frontmatter } = parseFrontmatter(fileContent);
    if (frontmatter.id === entityId) {
      foundFile = file;
      break;
    }
  }

  if (!foundFile) {
    return NextResponse.json({ error: "Lore file not found" }, { status: 404 });
  }

  fs.unlinkSync(path.join(dir, foundFile));

  return NextResponse.json({ success: true, deletedFile: foundFile });
}
