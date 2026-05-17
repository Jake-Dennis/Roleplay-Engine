/**
 * Migration: Sync YAML Frontmatter between DB and Markdown Files
 *
 * Scans all user data directories for .md files and:
 * 1. If frontmatter exists: sync fields to DB (name, importance, canon_tier, tags)
 * 2. If no frontmatter: generate from DB metadata and prepend to file
 *
 * Usage: npx tsx scripts/sync-frontmatter.ts
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DATA_DIR = path.join(process.cwd(), "data");
const dbPath = path.join(DATA_DIR, "global.db");

const LORE_TYPES = ["locations", "npcs", "events", "relationships"] as const;
type LoreType = (typeof LORE_TYPES)[number];

interface LoreFrontmatter {
  id: string;
  name: string;
  type: string;
  importance?: string;
  tags?: string[];
  canon_tier?: string;
  canon_layer?: string;
  parent_id?: string | null;
  created_at?: string;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatterStr = match[1];
  const body = match[2] || "";
  const frontmatter: Record<string, any> = {};

  for (const line of frontmatterStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (value.startsWith("[")) {
      try {
        frontmatter[key] = JSON.parse(value);
        continue;
      } catch { /* fall through */ }
    }

    if (value === "true") { frontmatter[key] = true; continue; }
    if (value === "false") { frontmatter[key] = false; continue; }

    if (!isNaN(Number(value)) && value !== "") {
      frontmatter[key] = Number(value);
      continue;
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function buildFrontmatter(fm: LoreFrontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`id: ${fm.id}`);
  lines.push(`name: "${fm.name.replace(/"/g, '\\"')}"`);
  lines.push(`type: ${fm.type}`);
  if (fm.importance) lines.push(`importance: ${fm.importance}`);
  if (fm.tags && fm.tags.length > 0) {
    lines.push(`tags:\n${fm.tags.map((t) => `  - "${t}"`).join("\n")}`);
  }
  if (fm.canon_tier) lines.push(`canon_tier: ${fm.canon_tier}`);
  if (fm.canon_layer) lines.push(`canon_layer: ${fm.canon_layer}`);
  if (fm.parent_id) lines.push(`parent_id: ${fm.parent_id}`);
  if (fm.created_at) lines.push(`created_at: ${fm.created_at}`);
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function syncFrontmatterToDb(db: any, userId: string, entityType: LoreType, entityId: string, frontmatter: Record<string, any>): string[] {
  const updatedFields: string[] = [];

  const fieldMap: Record<string, string> = {
    name: entityType === "events" ? "title" : "name",
    importance: "importance",
    canon_tier: "canon_tier",
    canon_layer: "canon_layer",
    tags: "tags",
  };

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [fmKey, dbCol] of Object.entries(fieldMap)) {
    if (frontmatter[fmKey] !== undefined && frontmatter[fmKey] !== null) {
      let dbValue: unknown = frontmatter[fmKey];
      if (fmKey === "tags" && Array.isArray(dbValue)) {
        dbValue = JSON.stringify(dbValue);
      }
      updates.push(`${dbCol} = ?`);
      values.push(dbValue);
      updatedFields.push(fmKey);
    }
  }

  if (updates.length === 0) return updatedFields;

  values.push(entityId);
  values.push(userId);

  db.prepare(
    `UPDATE ${entityType} SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
  ).run(...values);

  return updatedFields;
}

function main() {
  console.log("Running migration: sync frontmatter between DB and markdown files...\n");

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Get all users
  const users = db.prepare("SELECT id, username FROM users").all() as { id: string; username: string }[];
  console.log(`Found ${users.length} user(s)\n`);

  let totalFiles = 0;
  let filesWithFrontmatter = 0;
  let filesWithoutFrontmatter = 0;
  let dbUpdates = 0;
  let filesGenerated = 0;

  for (const user of users) {
    console.log(`Processing user: ${user.username} (${user.id})`);

    for (const type of LORE_TYPES) {
      const dir = path.join(DATA_DIR, user.id, type);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      if (files.length === 0) continue;

      console.log(`  ${type}: ${files.length} file(s)`);

      for (const file of files) {
        totalFiles++;
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const { frontmatter, body } = parseFrontmatter(content);

        if (frontmatter.id) {
          // File has frontmatter — sync to DB
          filesWithFrontmatter++;
          const updated = syncFrontmatterToDb(db, user.id, type, frontmatter.id, frontmatter);
          if (updated.length > 0) {
            dbUpdates++;
            console.log(`    ✓ ${file}: synced ${updated.join(", ")} to DB`);
          }
        } else {
          // No frontmatter — try to generate from DB
          filesWithoutFrontmatter++;
          const entity = db.prepare(
            `SELECT * FROM ${type} WHERE id = ? AND user_id = ?`
          ).get(file.replace(".md", ""), user.id) as Record<string, any> | undefined;

          if (entity) {
            const fm: LoreFrontmatter = {
              id: entity.id,
              name: entity.name || entity.title || "Unknown",
              type: type === "locations" ? "location" : type === "npcs" ? "npc" : type === "events" ? "event" : "relationship",
              importance: entity.importance || undefined,
              tags: entity.tags ? JSON.parse(entity.tags) : undefined,
              canon_tier: entity.canon_tier || undefined,
              canon_layer: entity.canon_layer || undefined,
              parent_id: entity.parent_location_id || undefined,
              created_at: entity.created_at || undefined,
            };

            const newContent = buildFrontmatter(fm) + body;
            fs.writeFileSync(filePath, newContent, "utf-8");
            filesGenerated++;
            console.log(`    + ${file}: generated frontmatter from DB`);
          } else {
            console.log(`    ? ${file}: no matching DB entity, skipping`);
          }
        }
      }
    }
    console.log("");
  }

  console.log("\n--- Summary ---");
  console.log(`Total files scanned: ${totalFiles}`);
  console.log(`Files with frontmatter: ${filesWithFrontmatter}`);
  console.log(`Files without frontmatter: ${filesWithoutFrontmatter}`);
  console.log(`DB updates from frontmatter: ${dbUpdates}`);
  console.log(`Frontmatter generated from DB: ${filesGenerated}`);
  console.log("\nMigration complete.");

  db.close();
}

main();
