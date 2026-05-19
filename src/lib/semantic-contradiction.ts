/**
 * Semantic Contradiction Detection
 *
 * Uses embedding similarity to find related canon entries, then compares
 * them via LLM to detect factual, temporal, location, or character contradictions.
 *
 * Workflow:
 * 1. Generate embedding for new content (bge-m3)
 * 2. Vector search against validated canon entries (top 5 by similarity)
 * 3. For each similar entry (similarity > 0.7), run LLM comparison
 * 4. LLM returns structured JSON: contradicts, type, severity, explanation
 * 5. Aggregate results with existing rule-based contradictions
 *
 * Contradiction types: factual, temporal, location, character, none
 * Severity levels: high, medium, low
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { vectorSearch } from "@/lib/vector-search";
import { CONTENT_LIMITS } from "@/lib/config";
import * as fs from "fs";

export interface CanonEntry {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  content: string;
  similarity: number;
}

export interface SemanticContradiction {
  type: "factual" | "temporal" | "location" | "character";
  severity: "high" | "medium" | "low";
  explanation: string;
  conflictingEntry: CanonEntry;
  similarityScore: number;
}

/**
 * Find canon entries similar to the given content using vector search.
 * Only returns entries with similarity above the threshold.
 */
export async function findSimilarCanonEntries(
  userId: string,
  content: string,
  topK: number = 10,
  minSimilarity: number = 0.7
): Promise<CanonEntry[]> {
  const db = getDb();

  // Search across all entity types for validated canon
  const results = await vectorSearch(userId, content, {
    limit: topK,
    minScore: minSimilarity,
  });

  const entries: CanonEntry[] = [];

  for (const result of results) {
    let title = "";
    let fullContent = result.textContent || "";

    // Fetch full entity data based on type
    switch (result.entityType) {
      case "locations": {
        const row = db.prepare(
          "SELECT name, description FROM locations WHERE id = ? AND user_id = ?"
        ).get(result.entityId, userId) as { name: string; description: string | null } | undefined;
        if (row) {
          title = row.name;
          fullContent = row.description || fullContent;
        }
        break;
      }
      case "npcs": {
        const row = db.prepare(
          "SELECT name, file_path FROM npcs WHERE id = ? AND user_id = ?"
        ).get(result.entityId, userId) as { name: string; file_path: string | null } | undefined;
        if (row) {
          title = row.name;
          // Read file content if available
          if (row.file_path) {
            try {
              if (fs.existsSync(row.file_path)) {
                fullContent = fs.readFileSync(row.file_path, "utf-8").slice(0, 2000);
              }
            } catch {
              // Use text_content from embedding
            }
          }
        }
        break;
      }
      case "events": {
        const row = db.prepare(
          "SELECT title, outcome FROM events WHERE id = ? AND user_id = ?"
        ).get(result.entityId, userId) as { title: string; outcome: string | null } | undefined;
        if (row) {
          title = row.title;
          fullContent = row.outcome || fullContent;
        }
        break;
      }
      case "narrative_memories": {
        const row = db.prepare(
          "SELECT type, content FROM narrative_memories WHERE id = ? AND user_id = ?"
        ).get(result.entityId, userId) as { type: string; content: string } | undefined;
        if (row) {
          title = row.type;
          fullContent = row.content;
        }
        break;
      }
      default:
        title = result.entityType;
    }

    // Convert distance to similarity (distance = 1 - similarity for cosine)
    const similarity = 1 - (result.score || 0);

    if (similarity >= minSimilarity) {
      entries.push({
        id: result.id,
        entityType: result.entityType,
        entityId: result.entityId,
        title,
        content: fullContent.slice(0, CONTENT_LIMITS.SUMMARY_CHUNK),
        similarity: Math.round(similarity * 100) / 100,
      });
    }
  }

  return entries;
}

/**
 * Build the LLM prompt for contradiction comparison.
 */
export function buildContradictionPrompt(
  existingEntry: CanonEntry,
  newContent: string
): string {
  return `Compare these two narrative entries for contradictions.

EXISTING CANON ENTRY:
Type: ${existingEntry.entityType}
Title: ${existingEntry.title}
Content: ${existingEntry.content}

NEW CONTENT:
${newContent}

Do these entries contradict each other? Consider:
- Factual conflicts (alive vs dead, present vs absent, identity conflicts)
- Temporal conflicts (event order impossibilities, timeline violations)
- Location conflicts (entity in two places at once, impossible geography)
- Character trait conflicts (personality, abilities, relationships)

Return JSON only:
{
  "contradicts": true or false,
  "type": "factual" or "temporal" or "location" or "character" or "none",
  "severity": "high" or "medium" or "low",
  "explanation": "brief explanation of the contradiction or why there is none"
}`;
}

/**
 * Compare new content against a canon entry using LLM.
 * Returns a contradiction if found, null otherwise.
 */
export async function compareForContradiction(
  existingEntry: CanonEntry,
  newContent: string
): Promise<SemanticContradiction | null> {
  const prompt = buildContradictionPrompt(existingEntry, newContent);

  try {
    const response = await generateText(prompt, {
      temperature: 0.1,
      num_ctx: 4096,
    });

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.contradicts && parsed.type !== "none") {
      return {
        type: parsed.type as SemanticContradiction["type"],
        severity: parsed.severity as SemanticContradiction["severity"],
        explanation: parsed.explanation || "Potential contradiction detected",
        conflictingEntry: existingEntry,
        similarityScore: existingEntry.similarity,
      };
    }
  } catch {
    // LLM comparison failed — skip this entry
  }

  return null;
}

/**
 * Detect semantic contradictions for new content against validated canon.
 * Returns array of contradictions found.
 */
export async function detectSemanticContradictions(
  userId: string,
  content: string,
  _entityType: string = "",
  entityId: string = ""
): Promise<SemanticContradiction[]> {
  // Find similar canon entries
  const similarEntries = await findSimilarCanonEntries(userId, content, 10, 0.7);

  if (similarEntries.length === 0) {
    return [];
  }

  // Compare each similar entry via LLM
  const contradictions: SemanticContradiction[] = [];

  for (const entry of similarEntries) {
    // Skip self-comparison
    if (entityId && entry.entityId === entityId) continue;

    const contradiction = await compareForContradiction(entry, content);
    if (contradiction) {
      contradictions.push(contradiction);
    }
  }

  return contradictions;
}

/**
 * Run semantic contradiction checks on all unverified lore for a user.
 * Called during idle-time enrichment (Tier 3: 15 min).
 */
export async function scanUnverifiedLoreForContradictions(
  userId: string
): Promise<{ checked: number; contradictionsFound: number }> {
  const db = getDb();

  // Get unverified lore validations
  const validations = db.prepare(`
    SELECT id, entity_type, entity_id, validation_notes
    FROM entity_validations
    WHERE user_id = ? AND state IN ('generated_unverified', 'under_review')
    LIMIT 20
  `).all(userId) as {
    id: string;
    entity_type: string;
    entity_id: string;
    validation_notes: string | null;
  }[];

  let checked = 0;
  let contradictionsFound = 0;

  for (const validation of validations) {
    // Get the entity content
    let content = "";
    switch (validation.entity_type) {
      case "location": {
        const row = db.prepare(
          "SELECT description FROM locations WHERE id = ? AND user_id = ?"
        ).get(validation.entity_id, userId) as { description: string | null } | undefined;
        content = row?.description || "";
        break;
      }
      case "npc": {
        const row = db.prepare(
          "SELECT file_path FROM npcs WHERE id = ? AND user_id = ?"
        ).get(validation.entity_id, userId) as { file_path: string | null } | undefined;
        if (row?.file_path) {
          try {
            if (fs.existsSync(row.file_path)) {
              content = fs.readFileSync(row.file_path, "utf-8").slice(0, CONTENT_LIMITS.SUMMARY_CHUNK);
            }
          } catch {
            // skip
          }
        }
        break;
      }
      case "event": {
        const row = db.prepare(
          "SELECT title, outcome FROM events WHERE id = ? AND user_id = ?"
        ).get(validation.entity_id, userId) as { title: string; outcome: string | null } | undefined;
        content = `${row?.title || ""}: ${row?.outcome || ""}`;
        break;
      }
    }

    if (!content.trim()) continue;

    const contradictions = await detectSemanticContradictions(
      userId,
      content,
      validation.entity_type,
      validation.entity_id
    );

    checked++;

    if (contradictions.length > 0) {
      contradictionsFound += contradictions.length;

      // Update validation state to under_review with contradiction details
      const notes = contradictions
        .map((c) => `[${c.type}/${c.severity}] ${c.explanation} (similarity: ${c.similarityScore})`)
        .join("\n");

      db.prepare(`
        UPDATE entity_validations
        SET state = 'under_review', validation_notes = ?
        WHERE id = ?
      `).run(notes, validation.id);
    }
  }

  return { checked, contradictionsFound };
}
