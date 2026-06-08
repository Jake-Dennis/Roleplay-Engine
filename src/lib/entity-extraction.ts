/**
 * Entity Mention Extraction
 *
 * Extracts entity mentions from narrative memories and message summaries
 * using regex/heuristic rules (no LLM). Stores results in the entity_mentions
 * table for downstream analysis (entity graphs, frequency tracking, etc.).
 *
 * Extraction sources:
 *   - [[wikilinks]]: Obsidian-style links, parsed via the same regex as wikilinks.ts
 *   - Capitalized proper nouns: /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g (2+ occurrences)
 */

import { getDb } from "./db";

const WIKILINK_REGEX = /(!?)\[\[([^\[\]]+?)(?:\|([^\[\]]+))?\]\]/g;
const PROPER_NOUN_REGEX = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;

export interface EntityMentionResult {
  count: number;
  entities: string[];
}

/**
 * Extract entity mentions from a single content string and upsert into entity_mentions.
 *
 * Parses content for wikilinks AND capitalized proper nouns appearing 2+ times.
 * On duplicate (user_id + entity_name + source_table + source_id), increments
 * frequency and updates last_seen_at.
 */
export function extractEntityMentions(
  userId: string,
  sourceTable: string,
  sourceId: string,
  content: string
): EntityMentionResult {
  const db = getDb();
  const entities = new Set<string>();

  if (!content) {
    return { count: 0, entities: [] };
  }

  // Extract entity names from [[wikilinks]]
  const wikilinkMatches = content.matchAll(WIKILINK_REGEX);
  for (const match of wikilinkMatches) {
    const name = match[2].trim();
    if (name) {
      entities.add(name);
    }
  }

  // Extract capitalized proper nouns that appear 2+ times
  const properNounCounts = new Map<string, number>();
  const properNounMatches = content.matchAll(PROPER_NOUN_REGEX);
  for (const match of properNounMatches) {
    const name = match[0].trim();
    if (name) {
      properNounCounts.set(name, (properNounCounts.get(name) || 0) + 1);
    }
  }
  for (const [name, count] of properNounCounts) {
    if (count >= 2) {
      entities.add(name);
    }
  }

  // Upsert each unique entity
  let inserted = 0;
  const selectStmt = db.prepare(
    "SELECT id FROM entity_mentions WHERE user_id = ? AND entity_name = ? AND source_table = ? AND source_id = ?"
  );
  const updateStmt = db.prepare(
    "UPDATE entity_mentions SET frequency = frequency + 1, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?"
  );
  const insertStmt = db.prepare(
    `INSERT INTO entity_mentions (id, user_id, entity_name, source_table, source_id, frequency, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );

  for (const entityName of entities) {
    const existing = selectStmt.get(userId, entityName, sourceTable, sourceId) as
      | { id: string }
      | undefined;

    if (existing) {
      updateStmt.run(existing.id);
    } else {
      const id = crypto.randomUUID();
      insertStmt.run(id, userId, entityName, sourceTable, sourceId);
    }
    inserted++;
  }

  return { count: inserted, entities: Array.from(entities) };
}

/**
 * Process all narrative_memories and message_summaries for a given user,
 * extracting entity mentions from each.
 */
export function processEntityMentions(userId: string): { count: number } {
  const db = getDb();
  let totalCount = 0;

  // Process narrative_memories (has direct user_id column)
  const memories = db.prepare(
    "SELECT id, content FROM narrative_memories WHERE user_id = ?"
  ).all(userId) as { id: string; content: string }[];

  for (const memory of memories) {
    const result = extractEntityMentions(
      userId,
      "narrative_memories",
      memory.id,
      memory.content || ""
    );
    totalCount += result.count;
  }

  // Process message_summaries (join through messages → sessions to get user's content)
  const summaries = db.prepare(`
    SELECT ms.id, COALESCE(ms.content, ms.summary, '') AS content
    FROM message_summaries ms
    JOIN messages m ON ms.source_message_id = m.id
    JOIN sessions s ON m.session_id = s.id
    WHERE s.owner_id = ?
  `).all(userId) as { id: string; content: string }[];

  for (const summary of summaries) {
    const result = extractEntityMentions(
      userId,
      "message_summaries",
      summary.id,
      summary.content || ""
    );
    totalCount += result.count;
  }

  return { count: totalCount };
}
