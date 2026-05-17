import fs from "fs";
import path from "path";
import { APP_CONFIG } from "@/lib/config";
import { getDb } from "@/lib/db";

/**
 * Sanitize a name into a safe filesystem filename.
 * - Strips characters invalid on Windows/macOS/Linux
 * - Truncates to 100 chars to avoid path length limits
 * - Falls back to a UUID-based name if result is empty
 */
export function sanitizeFilename(name: string, fallbackId?: string): string {
  // Remove invalid filename characters: < > : " / \ | ? * and control chars
  let safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
  // Replace whitespace with underscores
  safe = safe.replace(/\s+/g, "_");
  // Truncate to 100 chars
  safe = safe.substring(0, 100);
  // Remove trailing dots/spaces (Windows issue)
  safe = safe.replace(/[.\s]+$/, "");
  // Fallback if empty after sanitization
  if (!safe) {
    safe = fallbackId ? `entity_${fallbackId.slice(0, 8)}` : "unnamed";
  }
  return `${safe}.md`;
}

/**
 * Frontmatter fields for lore markdown files
 */
export interface LoreFrontmatter {
  id: string;
  name: string;
  type: "location" | "npc" | "event" | "relationship";
  importance?: string;
  tags?: string[];
  canon_tier?: string;
  parent_id?: string | null;
  created_at?: string;
}

/**
 * Generate markdown content with YAML frontmatter
 */
export function buildMarkdown(frontmatter: LoreFrontmatter, body: string = ""): string {
  const frontmatterLines: string[] = ["---"];
  frontmatterLines.push(`id: ${frontmatter.id}`);
  frontmatterLines.push(`name: "${frontmatter.name.replace(/"/g, '\\"')}"`);
  frontmatterLines.push(`type: ${frontmatter.type}`);
  if (frontmatter.importance) frontmatterLines.push(`importance: ${frontmatter.importance}`);
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    frontmatterLines.push(`tags:\n${frontmatter.tags.map((t: string) => `  - "${t}"`).join("\n")}`);
  }
  if (frontmatter.canon_tier) frontmatterLines.push(`canon_tier: ${frontmatter.canon_tier}`);
  if (frontmatter.parent_id) frontmatterLines.push(`parent_id: ${frontmatter.parent_id}`);
  if (frontmatter.created_at) frontmatterLines.push(`created_at: ${frontmatter.created_at}`);
  frontmatterLines.push("---");
  frontmatterLines.push("");
  if (body) frontmatterLines.push(body);
  return frontmatterLines.join("\n");
}

/**
 * Write a lore markdown file to the user's data directory
 * Returns the relative file path
 */
export function writeLoreFile(
  userId: string,
  type: "locations" | "npcs" | "events" | "relationships",
  filename: string,
  content: string
): string {
  const dir = path.join(APP_CONFIG.dataDir, userId, type);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return path.relative(path.join(APP_CONFIG.dataDir, userId), filePath);
}

/**
 * Delete a lore markdown file
 */
export function deleteLoreFile(userId: string, relativePath: string): void {
  const fullPath = path.join(APP_CONFIG.dataDir, userId, relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

/**
 * Parse [[wikilinks]] from markdown content
 * Returns array of { name, context } where context is the surrounding text
 */
export function parseWikilinks(content: string): { name: string; context: string }[] {
  const links: { name: string; context: string }[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const start = Math.max(0, match.index - 40);
    const end = Math.min(content.length, match.index + match[0].length + 40);
    const context = content.slice(start, end).replace(/\[\[|\]\]/g, "");
    links.push({ name, context });
  }
  return links;
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns { frontmatter, body }
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
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

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse arrays (simple inline arrays)
    if (value.startsWith("[")) {
      try {
        frontmatter[key] = JSON.parse(value);
        continue;
      } catch { /* fall through */ }
    }

    // Parse booleans
    if (value === "true") { frontmatter[key] = true; continue; }
    if (value === "false") { frontmatter[key] = false; continue; }

    // Parse numbers
    if (!isNaN(Number(value)) && value !== "") {
      frontmatter[key] = Number(value);
      continue;
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Sync frontmatter from a markdown file to the database.
 * DB is source of truth — frontmatter fields are merged into DB, not overwritten.
 * Returns list of fields that were updated.
 */
export function syncFrontmatterToDb(
  userId: string,
  entityType: "locations" | "npcs" | "events" | "relationships",
  entityId: string,
  filePath: string
): string[] {
  const db = getDb();
  const updatedFields: string[] = [];

  // Read file
  if (!fs.existsSync(filePath)) return updatedFields;
  const content = fs.readFileSync(filePath, "utf-8");
  const { frontmatter } = parseFrontmatter(content);

  // Map of frontmatter keys to DB columns per entity type
  const fieldMap: Record<string, string> = {
    name: entityType === "events" ? "title" : "name",
    importance: "importance",
    canon_tier: "canon_tier",
    canon_layer: "canon_layer",
    tags: "tags",
  };

  // Build update query
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [fmKey, dbCol] of Object.entries(fieldMap)) {
    if (frontmatter[fmKey] !== undefined && frontmatter[fmKey] !== null) {
      let dbValue: unknown = frontmatter[fmKey];
      // Tags need JSON serialization
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

/**
 * Sync database metadata to frontmatter in a markdown file.
 * Reads current DB state, rebuilds frontmatter, preserves body content.
 */
export function syncDbToFrontmatter(
  userId: string,
  entityType: "locations" | "npcs" | "events" | "relationships",
  entityId: string,
  filePath: string
): boolean {
  const db = getDb();

  // Get entity from DB
  const entity = db.prepare(
    `SELECT * FROM ${entityType} WHERE id = ? AND user_id = ?`
  ).get(entityId, userId) as Record<string, any> | undefined;

  if (!entity) return false;

  // Read existing file
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf-8");
  const { frontmatter: existingFm, body } = parseFrontmatter(content);

  // Build new frontmatter from DB
  const newFm: LoreFrontmatter = {
    id: entity.id,
    name: entity.name || entity.title || "Unknown",
    type: entityType === "locations" ? "location" : entityType === "npcs" ? "npc" : entityType === "events" ? "event" : "relationship",
    importance: entity.importance || existingFm.importance,
    tags: entity.tags ? JSON.parse(entity.tags) : existingFm.tags,
    canon_tier: entity.canon_tier || existingFm.canon_tier,
    parent_id: entity.parent_location_id || existingFm.parent_id,
    created_at: entity.created_at || existingFm.created_at,
  };

  // Rebuild file content
  const newContent = buildMarkdown(newFm, body);

  // Only write if content changed
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, "utf-8");
    return true;
  }

  return false;
}
