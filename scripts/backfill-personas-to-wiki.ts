/**
 * Backfill Personas & NPCs → Wiki .md Files
 *
 * Reads all rows from the `personas` and `npcs` SQLite tables and creates
 * wiki markdown files at:
 *   data/{userId}/wiki/{universe}/entities/characters/{name}.md
 *
 * Also registers each entity in the entity_registry if not already present.
 *
 * Safe to run multiple times — skips rows where entity_id already has a
 * corresponding wiki file.
 *
 * Usage: npx tsx scripts/backfill-personas-to-wiki.ts
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const dbPath = path.join(DATA_DIR, "global.db");

interface PersonaRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  first_mes: string | null;
  mes_example: string | null;
  creator_notes: string | null;
  system_prompt: string | null;
  post_history_instructions: string | null;
  tags: string | null;
  writing_style: string | null;
  avatar_url: string | null;
  llm_model: string | null;
  tts_voice: string | null;
  is_active: number;
  entity_id: string | null;
  created_at: string;
}

interface NpcRow {
  id: string;
  user_id: string;
  universe_id: string | null;
  name: string;
  description: string | null;
  personality_traits: string | null;
  behavior_patterns: string | null;
  voice_id: string | null;
  is_canon: number;
  entity_id: string | null;
  created_at: string;
}

interface UniverseRow {
  id: string;
  name: string;
  user_id: string;
}

/**
 * Ensure a directory exists.
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Build a wiki frontmatter block from key-value pairs.
 */
function buildFrontmatter(fields: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      // Escape double quotes in YAML values
      const escaped = value.replace(/"/g, '\\"');
      lines.push(`${key}: "${escaped}"`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `"${v}"`).join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Get the default universe for a user (first one found, or null).
 */
function getDefaultUniverse(db: Database.Database, userId: string): string | null {
  const universe = db.prepare(
    "SELECT id FROM universes WHERE user_id = ? ORDER BY created_at ASC LIMIT 1"
  ).get(userId) as UniverseRow | undefined;
  return universe?.id || null;
}

/**
 * Write a character wiki page.
 */
function writeCharacterWiki(
  userId: string,
  universeId: string | null,
  entityType: string,
  name: string,
  description: string | null,
  createdAt: string,
  extraFrontmatter: Record<string, unknown> = {}
): string | null {
  // Determine wiki root
  const universe = universeId || "default";
  const wikiRoot = path.join(DATA_DIR, userId, "wiki", universe, "entities", "characters");
  ensureDir(wikiRoot);

  // Sanitize filename
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!safeName) {
    console.warn(`  ⚠ Skipping "${name}" — invalid filename after sanitization`);
    return null;
  }

  const filePath = path.join(wikiRoot, `${safeName}.md`);

  // Skip if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`  ⏭ Skipping "${name}" — wiki file already exists`);
    return null;
  }

  // Generate entity_id with type prefix
  const typePrefix = entityType === "npc" ? "npc" : "persona";
  const entityId = `${typePrefix}:${crypto.randomUUID()}`;

  const frontmatter = buildFrontmatter({
    title: name,
    type: "entity",
    subtype: "character",
    status: "reviewed",
    entity_id: entityId,
    created: createdAt,
    updated: new Date().toISOString(),
    ...extraFrontmatter,
  });

  const body = description || "";
  const content = `${frontmatter}\n\n${body}`;

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`  ✅ Created: ${filePath}`);

  // Register in entity_registry if not already there
  try {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.prepare(
      "INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, ?, ?, ?, ?)"
    ).run(entityId, entityType, name, userId, universeId || null);
    db.close();
  } catch {
    // Non-fatal — registry entry is a nice-to-have
  }

  return filePath;
}

/**
 * Regenerate index.md for a wiki root.
 */
function regenerateIndex(wikiRoot: string): void {
  const indexPath = path.join(wikiRoot, "index.md");
  const entitiesDir = path.join(wikiRoot, "entities");
  const charactersDir = path.join(entitiesDir, "characters");

  if (!fs.existsSync(charactersDir)) return;

  const files = fs.readdirSync(charactersDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return;

  const lines = ["# Wiki Index", "", "## Entities", ""];
  for (const file of files) {
    const filePath = path.join(charactersDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const titleMatch = content.match(/^title:\s*"(.+)"$/m);
      const title = titleMatch ? titleMatch[1] : file.replace(".md", "");
      const statusMatch = content.match(/^status:\s*(\w+)$/m);
      const status = statusMatch ? statusMatch[1] : "draft";
      lines.push(`- [[${title}]] — Character (status: ${status})`);
    } catch {
      lines.push(`- [[${file.replace(".md", "")}]] — Character`);
    }
  }

  lines.push("");
  fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");
  console.log(`  📝 Regenerated index: ${indexPath}`);
}

function main(): void {
  console.log("=== Backfill: Personas & NPCs → Wiki ===\n");

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Track which wiki roots need index regeneration
  const wikiRoots = new Set<string>();

  // -----------------------------------------------------------------------
  // 1. Backfill personas
  // -----------------------------------------------------------------------
  console.log("1. Processing personas...");
  const personas = db.prepare(
    "SELECT * FROM personas ORDER BY user_id, created_at ASC"
  ).all() as PersonaRow[];

  let personaCount = 0;
  for (const p of personas) {
    const universeId = getDefaultUniverse(db, p.user_id);
    const extra: Record<string, unknown> = {};

    // Preserve any non-null optional fields as frontmatter
    if (p.personality) extra.personality = p.personality;
    if (p.scenario) extra.scenario = p.scenario;
    if (p.first_mes) extra.first_mes = p.first_mes;
    if (p.mes_example) extra.mes_example = p.mes_example;
    if (p.system_prompt) extra.system_prompt = p.system_prompt;
    if (p.post_history_instructions) extra.post_history_instructions = p.post_history_instructions;
    if (p.writing_style) extra.writing_style = p.writing_style;
    if (p.llm_model) extra.llm_model = p.llm_model;
    if (p.tts_voice) extra.tts_voice = p.tts_voice;
    if (p.tags) {
      try {
        extra.tags = JSON.parse(p.tags);
      } catch {
        extra.tags = p.tags.split(",").map((t: string) => t.trim());
      }
    }

    const filePath = writeCharacterWiki(
      p.user_id,
      universeId,
      "persona",
      p.name,
      p.description,
      p.created_at,
      extra
    );

    if (filePath) {
      personaCount++;
      const wikiRoot = path.dirname(path.dirname(path.dirname(filePath)));
      wikiRoots.add(wikiRoot);
    }
  }
  console.log(`   Total personas processed: ${personaCount}/${personas.length}\n`);

  // -----------------------------------------------------------------------
  // 2. Backfill NPCs
  // -----------------------------------------------------------------------
  console.log("2. Processing NPCs...");
  const npcs = db.prepare(
    "SELECT * FROM npcs ORDER BY user_id, created_at ASC"
  ).all() as NpcRow[];

  let npcCount = 0;
  for (const n of npcs) {
    const extra: Record<string, unknown> = {};

    if (n.personality_traits) {
      try {
        extra.tags = JSON.parse(n.personality_traits);
      } catch {
        extra.tags = n.personality_traits.split(",").map((t: string) => t.trim());
      }
    }
    if (n.behavior_patterns) extra.behavior_patterns = n.behavior_patterns;
    if (n.voice_id) extra.tts_voice = n.voice_id;

    const filePath = writeCharacterWiki(
      n.user_id,
      n.universe_id,
      "npc",
      n.name,
      n.description,
      n.created_at,
      extra
    );

    if (filePath) {
      npcCount++;
      const wikiRoot = path.dirname(path.dirname(path.dirname(filePath)));
      wikiRoots.add(wikiRoot);
    }
  }
  console.log(`   Total NPCs processed: ${npcCount}/${npcs.length}\n`);

  // -----------------------------------------------------------------------
  // 3. Regenerate index.md files
  // -----------------------------------------------------------------------
  console.log("3. Regenerating wiki indexes...");
  for (const wikiRoot of wikiRoots) {
    regenerateIndex(wikiRoot);
  }
  console.log(`   Indexes regenerated: ${wikiRoots.size}\n`);

  db.close();
  console.log("=== Backfill complete ===");
}

main();
