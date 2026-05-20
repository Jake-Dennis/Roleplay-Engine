/**
 * Relationship Markdown Storage
 *
 * Mirrors relationship DB records to Obsidian-style markdown files in
 * relationship-specific directories: data/<user_id>/relationships/<Source_Target>/
 *
 * Each relationship directory contains:
 * - relationship.md — main relationship file with frontmatter + emotional state + notes
 * - history.md — shared history log with wikilink references to events
 *
 * The database remains the source of truth. Markdown files are a mirror for
 * Obsidian-style browsing, editing, and backlink discovery.
 */

import fs from "fs";
import path from "path";
import { APP_CONFIG } from "@/lib/config";
import { getDb } from "@/lib/db";
import { buildMarkdown, parseFrontmatter, LoreFrontmatter } from "@/lib/markdown-utils";
import { EMOTION_HALF_LIVES } from "@/lib/relationship-constants";

export interface RelationshipRecord {
  id: string;
  user_id: string;
  universe_id: string | null;
  source_entity: string;
  target_entity: string;
  emotional_state: string | null; // JSON: { trust: 0.62, suspicion: 0.31, ... }
  shared_history: string | null;  // JSON: [{ type, summary, at }, ...]
  relationship_stage: string | null;
  decay_rates: string | null;     // JSON: { emotionalHalfLifeDays, stageRegressionDays, minEmotionalState }
  updated_at: string | null;
  created_at: string | null;
}

export interface RelationshipMarkdownData {
  frontmatter: LoreFrontmatter & {
    source: string;
    target: string;
    universe_id?: string;
    relationship_stage: string;
    updated_at: string;
  };
  emotionalState: Record<string, number>;
  sharedHistory: Array<{ type: string; summary: string; at: string }>;
  decayConfig: {
    emotionalHalfLifeDays: number;
    stageRegressionDays: number;
    minEmotionalState: string;
  };
  notes: string;
}

// Default decay configuration
const DEFAULT_DECAY_CONFIG = {
  emotionalHalfLifeDays: 7,
  stageRegressionDays: 14,
  minEmotionalState: "neutral",
};

/**
 * Sanitize entity name for filesystem directory naming.
 */
function sanitizeDirName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50)
    .replace(/[.\s]+$/, "")
    .toLowerCase() || "unknown";
}

/**
 * Get the directory path for a relationship.
 * Format: data/<user_id>/relationships/<source>_<target>/
 */
export function getRelationshipDirPath(
  userId: string,
  source: string,
  target: string
): string {
  const dirName = `${sanitizeDirName(source)}_${sanitizeDirName(target)}`;
  return path.join(APP_CONFIG.dataDir, userId, "relationships", dirName);
}

/**
 * Get the file path for the main relationship markdown.
 */
export function getRelationshipFilePath(
  userId: string,
  source: string,
  target: string
): string {
  return path.join(getRelationshipDirPath(userId, source, target), "relationship.md");
}

/**
 * Get the file path for the shared history markdown.
 */
export function getHistoryFilePath(
  userId: string,
  source: string,
  target: string
): string {
  return path.join(getRelationshipDirPath(userId, source, target), "history.md");
}

/**
 * Build the markdown content for a relationship file.
 */
export function buildRelationshipMarkdown(rel: RelationshipRecord): string {
  const emotionalState = rel.emotional_state ? JSON.parse(rel.emotional_state) : {};
  const decayRates = rel.decay_rates ? JSON.parse(rel.decay_rates) : DEFAULT_DECAY_CONFIG;

  // Build emotional state table
  const emotionRows = Object.entries(emotionalState)
    .map(([emotion, value]) => {
      const halfLife = EMOTION_HALF_LIVES[emotion] || decayRates.emotionalHalfLifeDays;
      return `| ${emotion} | ${(value as number).toFixed(2)} | ${halfLife} days |`;
    })
    .join("\n");

  const emotionTable = emotionRows
    ? `## Emotional State\n\n| Emotion | Value | Half-Life |\n|---------|-------|-----------|\n${emotionRows}\n`
    : "";

  // Build shared history with wikilinks
  const sharedHistory = rel.shared_history ? JSON.parse(rel.shared_history) : [];
  const historyItems = sharedHistory
    .map((entry: { type: string; summary: string; at: string }) => {
      // Convert event references to wikilinks if they look like event names
      const summaryWithLinks = entry.summary.replace(
        /\[\[([^\]]+)\]\]/g,
        "[[$1]]"
      );
      return `- ${summaryWithLinks} — ${entry.type} (${new Date(entry.at).toLocaleDateString()})`;
    })
    .join("\n");

  const historySection = historyItems
    ? `## Shared History\n\n${historyItems}\n`
    : "";

  // Build body
  const body = `# ${rel.source_entity} ↔ ${rel.target_entity}\n\n${emotionTable}\n## Relationship Stage\n\n**${rel.relationship_stage || "acquaintances"}**\n\n${historySection}\n## Decay Configuration\n\n- Emotional half-life: ${decayRates.emotionalHalfLifeDays} days\n- Stage regression: ${decayRates.stageRegressionDays} days\n- Minimum emotional state: ${decayRates.minEmotionalState}\n\n## Notes\n\n`;

  // Build frontmatter
  const frontmatter: LoreFrontmatter = {
    id: rel.id,
    name: `${rel.source_entity} ↔ ${rel.target_entity}`,
    type: "relationship",
    importance: "medium",
    created_at: rel.created_at || undefined,
  };

  return buildMarkdown(frontmatter, body);
}

/**
 * Build the markdown content for the shared history file.
 */
export function buildHistoryMarkdown(rel: RelationshipRecord): string {
  const sharedHistory = rel.shared_history ? JSON.parse(rel.shared_history) : [];

  const historyEntries = sharedHistory
    .map((entry: { type: string; summary: string; at: string }) => {
      const date = new Date(entry.at).toLocaleDateString();
      const time = new Date(entry.at).toLocaleTimeString();
      return `### ${entry.type} — ${date} ${time}\n\n${entry.summary}\n`;
    })
    .join("\n---\n\n");

  return `# Shared History: ${rel.source_entity} ↔ ${rel.target_entity}\n\n${historyEntries || "*No shared history yet.*"}\n`;
}

/**
 * Parse a relationship markdown file back into structured data.
 */
export function parseRelationshipMarkdown(content: string): RelationshipMarkdownData {
  const { frontmatter: rawFm, body } = parseFrontmatter(content);

  // Extract emotional state from body table
  const emotionalState: Record<string, number> = {};
  const emotionTableMatch = body.match(/\| Emotion \| Value \| Half-Life \|\n\|[-| ]+\|\n([\s\S]*?)(?:\n\n|$)/);
  if (emotionTableMatch) {
    const rows = emotionTableMatch[1].trim().split("\n");
    for (const row of rows) {
      const cells = row.split("|").map((c: string) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        emotionalState[cells[0]] = parseFloat(cells[1]);
      }
    }
  }

  // Extract shared history from body
  const sharedHistory: Array<{ type: string; summary: string; at: string }> = [];
  const historyLines = body.split("\n").filter((line: string) => line.startsWith("- "));
  for (const line of historyLines) {
    const match = line.match(/^- (.+?) — (\w+) \((.+?)\)$/);
    if (match) {
      sharedHistory.push({
        summary: match[1],
        type: match[2],
        at: new Date(match[3]).toISOString(),
      });
    }
  }

  // Extract decay config from body
  const decayConfig = { ...DEFAULT_DECAY_CONFIG };
  const halfLifeMatch = body.match(/Emotional half-life:\s*(\d+)/);
  const regressionMatch = body.match(/Stage regression:\s*(\d+)/);
  const minStateMatch = body.match(/Minimum emotional state:\s*(\w+)/);
  if (halfLifeMatch) decayConfig.emotionalHalfLifeDays = parseInt(halfLifeMatch[1], 10);
  if (regressionMatch) decayConfig.stageRegressionDays = parseInt(regressionMatch[1], 10);
  if (minStateMatch) decayConfig.minEmotionalState = minStateMatch[1];

  // Extract notes (everything after "## Notes\n\n")
  const notesMatch = body.match(/## Notes\n\n([\s\S]*)$/);
  const notes = notesMatch ? notesMatch[1].trim() : "";

  return {
    frontmatter: {
      id: rawFm.id as string || "",
      name: rawFm.name as string || "",
      type: "relationship",
      source: rawFm.source as string || "",
      target: rawFm.target as string || "",
      universe_id: rawFm.universe_id as string | undefined,
      relationship_stage: rawFm.relationship_stage as string || "acquaintances",
      updated_at: rawFm.updated_at as string || "",
      importance: rawFm.importance as string | undefined,
      created_at: rawFm.created_at as string | undefined,
    },
    emotionalState,
    sharedHistory,
    decayConfig,
    notes,
  };
}

/**
 * Write a relationship's markdown files to the filesystem.
 * Creates the directory if it doesn't exist.
 */
export function writeRelationshipFiles(rel: RelationshipRecord): string {
  const dirPath = getRelationshipDirPath(rel.user_id, rel.source_entity, rel.target_entity);

  // Create directory if needed
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Write main relationship file
  const relContent = buildRelationshipMarkdown(rel);
  const relPath = path.join(dirPath, "relationship.md");
  fs.writeFileSync(relPath, relContent, "utf-8");

  // Write history file
  const historyContent = buildHistoryMarkdown(rel);
  const historyPath = path.join(dirPath, "history.md");
  fs.writeFileSync(historyPath, historyContent, "utf-8");

  return path.relative(path.join(APP_CONFIG.dataDir, rel.user_id), dirPath);
}

/**
 * Read a relationship's markdown files from the filesystem.
 * Returns null if the files don't exist.
 */
export function readRelationshipFiles(
  userId: string,
  source: string,
  target: string
): { relationship: RelationshipMarkdownData; history: string } | null {
  const relPath = getRelationshipFilePath(userId, source, target);
  const historyPath = getHistoryFilePath(userId, source, target);

  if (!fs.existsSync(relPath)) return null;

  const relContent = fs.readFileSync(relPath, "utf-8");
  const historyContent = fs.existsSync(historyPath)
    ? fs.readFileSync(historyPath, "utf-8")
    : "";

  return {
    relationship: parseRelationshipMarkdown(relContent),
    history: historyContent,
  };
}

/**
 * Delete a relationship's directory and all files.
 */
export function deleteRelationshipFiles(
  userId: string,
  source: string,
  target: string
): void {
  const dirPath = getRelationshipDirPath(userId, source, target);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Sync a DB relationship record to its markdown files.
 * Called after decay, analysis, or any relationship update.
 * Wraps in try/catch so filesystem errors don't break DB operations.
 */
export function syncRelationshipToFilesystem(relId: string): void {
  try {
    const db = getDb();
    const rel = db.prepare(
      "SELECT * FROM relationships WHERE id = ?"
    ).get(relId) as RelationshipRecord | undefined;

    if (rel) {
      writeRelationshipFiles(rel);
    }
  } catch {
    // Filesystem errors should not break DB operations
  }
}

/**
 * List all relationship directories for a user.
 * Returns array of directory names (e.g., ["player_haleth", "player_aragorn"]).
 */
export function getAllRelationshipDirs(userId: string): string[] {
  const relDir = path.join(APP_CONFIG.dataDir, userId, "relationships");
  if (!fs.existsSync(relDir)) return [];

  return fs.readdirSync(relDir).filter((entry) => {
    const fullPath = path.join(relDir, entry);
    return fs.statSync(fullPath).isDirectory();
  });
}

/**
 * Append a shared history entry to a relationship's markdown files.
 * Also updates the DB shared_history JSON array.
 */
export function appendSharedHistory(
  relId: string,
  entry: { type: string; summary: string; at: string }
): void {
  try {
    const db = getDb();
    const rel = db.prepare(
      "SELECT * FROM relationships WHERE id = ?"
    ).get(relId) as RelationshipRecord | undefined;

    if (!rel) return;

    // Update DB
    const existingHistory = rel.shared_history ? JSON.parse(rel.shared_history) : [];
    existingHistory.push(entry);

    db.prepare(
      "UPDATE relationships SET shared_history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(JSON.stringify(existingHistory), relId);

    // Update filesystem
    writeRelationshipFiles({
      ...rel,
      shared_history: JSON.stringify(existingHistory),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Filesystem errors should not break DB operations
  }
}
