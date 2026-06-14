import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { logger } from "@/lib/logger";
import { writeWikiPage, readWikiPage, listWikiPages, sanitizeWikiFilename } from "./file-io";
import { generateIndex } from "./index-generator";
// @deprecated: logger.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { appendLog } from "./logger";
import { getWikiRoot } from "./wiki-root";
import { queueJob } from "@/lib/jobs/queue";
import type { WikiFrontmatter } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An entity extracted from the LLM response by the extraction prompt.
 */
interface ExtractedEntity {
  name: string;
  type: "character" | "location" | "faction";
  description: string;
  importance: "high" | "medium" | "low";
}

/**
 * Result summary of an auto-extract operation.
 */
export interface AutoExtractResult {
  created: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMPORTANCE_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const ENTITIES_FOLDER = "entities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a universe context string from existing wiki pages.
 * Reads the universe overview (concepts/about.md) and existing entity pages
 * so the LLM has background lore when extracting entities from a response.
 */
function buildUniverseContext(wikiRoot: string): string {
  const parts: string[] = [];

  // Read universe overview (full content)
  const aboutPath = path.join(wikiRoot, "concepts", "about.md");
  if (fs.existsSync(aboutPath)) {
    try {
      const aboutPage = readWikiPage(aboutPath);
      const title = aboutPage.frontmatter.title || "Universe Overview";
      const content = (aboutPage.content || "").trim();
      if (content) {
        parts.push(`[${title}]\n${content}`);
      }
    } catch {
      // Non-blocking — overview is optional context
    }
  }

  // Read all existing entity descriptions (full content)
  const entitiesDir = path.join(wikiRoot, "entities");
  if (fs.existsSync(entitiesDir)) {
    try {
      const entityFiles = fs.readdirSync(entitiesDir).filter(f => f.endsWith(".md"));
      for (const file of entityFiles) {
        try {
          const page = readWikiPage(path.join(entitiesDir, file));
          const name = page.frontmatter.title || file.replace(".md", "");
          const desc = (page.content || "").trim();
          if (desc) {
            parts.push(`- ${name}: ${desc}`);
          }
        } catch {
          // Skip unreadable entity pages
        }
      }
    } catch {
      // Non-blocking — entities are optional context
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Auto-Extract
// ---------------------------------------------------------------------------

/**
 * Extract named entities from an AI narrative response, create/update wiki
 * pages for them, and return a summary of what happened.
 *
 * Flow:
 * 1. Guard against null universe → return early
 * 2. Resolve wiki root for the user
 * 3. Build list of existing page titles (for the LLM prompt)
 * 4. Call LLM to extract entities from the response
 * 5. Parse the JSON array returned by the LLM
 * 6. Sort by importance, take top 6, create/update/skip each
 * 7. Regenerate the wiki index
 * 8. Append to the operation log
 * 9. Return the summary
 *
 * @param sessionId  - The session from which the AI response originated
 * @param userId     - The user whose wiki to write into
 * @param universeId - The universe scope (null → early return)
 * @param aiResponse - The AI-generated narrative text to analyze
 * @returns AutoExtractResult with created/updated/skipped entity names and errors
 */
export async function extractAndCreateWikiEntities(
  sessionId: string,
  userId: string,
  universeId: string | null,
  aiResponse: string
): Promise<AutoExtractResult> {
  // Top-level try/catch — never throw
  try {
    // Step 1: Null universe guard
    if (universeId === null) {
      return { created: [], updated: [], skipped: ["No universe"], errors: [] };
    }

    // Step 2: Get wiki root
    const wikiRoot = getWikiRoot(userId, universeId);

    // Step 3: Get existing page titles (case-insensitive hint for the LLM)
    const existingPages = listWikiPages(wikiRoot);
    const existingTitles = existingPages
      .map((p) => p.frontmatter.title)
      .filter((t): t is string => Boolean(t))
      .join(", ");

    // Step 4: Call LLM with extraction prompt
    let response: string;
    try {
      const universeContext = buildUniverseContext(wikiRoot);
      const prompt = PROMPTS.extractEntitiesFromResponse(aiResponse, universeContext, existingTitles);
      response = await generateText(prompt, { temperature: 0.3, userId, model: getActiveJobModel(userId) });
    } catch (err) {
      logger.error("[auto-extract] LLM call failed:", err);
      return { created: [], updated: [], skipped: [], errors: ["llm_call_failed"] };
    }

    // Step 5: Parse JSON
    let entities: ExtractedEntity[] = [];
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        entities = parsed;
      }
      // Non-array → treat as empty (already set to [])
    } catch (err) {
      logger.error("[auto-extract] Failed to parse LLM response as JSON:", err);
      return { created: [], updated: [], skipped: [], errors: ["parse"] };
    }

    // Step 6: Queue each entity as a separate job
    entities.sort(
      (a, b) =>
        (IMPORTANCE_ORDER[a.importance] ?? 99) -
        (IMPORTANCE_ORDER[b.importance] ?? 99)
    );

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const entity of entities) {
      try {
        queueJob(userId, "wiki_create_entity", {
          userId,
          universeId: universeId || undefined,
          sessionId,
          entityType: entity.type,
          entityId: entity.name,
          name: entity.name,
          type: entity.type,
          description: entity.description,
          importance: entity.importance,
        }, "low", universeId || undefined);
        created.push(entity.name);

        // Register entity in the entity registry (auxiliary — non-fatal)
        const registryEntityType = entity.type === "character" ? "npc" : entity.type === "location" ? "location" : null;
        if (registryEntityType) {
          try {
            const db = getDb();
            // Check for existing persona entity first
            const persona = universeId ? db.prepare(
              "SELECT id FROM entity_registry WHERE LOWER(display_name) = LOWER(?) AND entity_type = 'persona' AND universe_id = ?"
            ).get(entity.name, universeId) as { id: string } | undefined : null;
            if (persona) {
              // Link to persona — no duplicate needed
            } else {
              const existing = db.prepare(
                "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ?"
              ).get(entity.name, userId) as { id: string } | undefined;
            if (!existing) {
              const entityId = `${registryEntityType}:${crypto.randomUUID()}`;
              db.prepare(
                "INSERT INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, ?, ?, ?, ?)"
              ).run(entityId, registryEntityType, entity.name, userId, universeId || null);
              db.prepare(
                "INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'wiki_sync')"
              ).run(crypto.randomUUID(), entityId, entity.name);
            }
          }
        } catch {
            // non-fatal — registry is auxiliary
          }
        }
      } catch (err) {
        logger.error(`[auto-extract] Failed to queue entity job for "${entity.name}":`, err);
        errors.push(entity.name);
      }
    }

    // ── Relationship Extraction ─────────────────────────────────────────
    // Call LLM to extract relationships from the AI response, then create
    // wiki pages and DB records for each.
    const CONCEPTS_FOLDER = "concepts";
    let relationshipResponse: string;
    try {
      const relPrompt = PROMPTS.extractRelationshipsFromResponse(aiResponse, existingTitles);
      relationshipResponse = await generateText(relPrompt, { temperature: 0.3, userId, model: getActiveJobModel(userId) });
    } catch (err) {
      logger.error("[auto-extract] Relationship LLM call failed:", err);
      errors.push("rel_llm_failed");
      relationshipResponse = "[]";
    }

    if (relationshipResponse) {
      try {
        const parsed = JSON.parse(relationshipResponse);
        if (Array.isArray(parsed)) {
          for (const rel of parsed) {
            if (!rel?.source || !rel?.target) continue;
            try {
              const relSlug = `${rel.source}-${rel.target}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
              const relFilename = `relationship_${relSlug}.md`;
              const relPath = path.join(wikiRoot, CONCEPTS_FOLDER, relFilename);

              // Create or update wiki page
              if (fs.existsSync(relPath)) {
                const existingRelPage = readWikiPage(relPath);
                if (existingRelPage.frontmatter.status === "draft") {
                  const dateStr = new Date().toISOString().split("T")[0];
                  const updatedContent =
                    existingRelPage.content.trimEnd() +
                    `\n\n## Session Update (${dateStr})\n\n${rel.description || ""}`;
                  const updatedFrontmatter: WikiFrontmatter = {
                    ...existingRelPage.frontmatter,
                    updated: new Date().toISOString(),
                  };
                  writeWikiPage(relPath, updatedContent, updatedFrontmatter);
                  updated.push(relFilename);
                } else {
                  skipped.push(relFilename);
                }
              } else {
                const relBody = `**Nature:** ${rel.nature || "unknown"}\n**Entities:** [[${rel.source}]] ↔ [[${rel.target}]]\n\n## Description\n${rel.description || ""}\n\n*Auto-extracted during session ${sessionId}*`;
                const relFrontmatter: WikiFrontmatter = {
                  title: `${rel.source} ↔ ${rel.target}`,
                  type: "concept",
                  status: "draft",
                  tags: ["relationship", "auto-generated", `nature:${rel.nature || "unknown"}`, `source:session-${sessionId}`],
                  created: new Date().toISOString(),
                  updated: new Date().toISOString(),
                };
                writeWikiPage(relPath, relBody, relFrontmatter);
                created.push(relFilename);
              }

              // Create DB record
              const existingRel = getDb().prepare(
                "SELECT id FROM relationships WHERE user_id = ? AND universe_id = ? AND LOWER(source_entity) = LOWER(?) AND LOWER(target_entity) = LOWER(?)"
              ).get(userId, universeId, rel.source, rel.target) as { id: string } | undefined;
              if (!existingRel) {
                getDb().prepare(
                  `INSERT INTO relationships (id, user_id, universe_id, source_entity, target_entity, emotional_state, shared_history)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).run(
                  crypto.randomUUID(),
                  userId,
                  universeId,
                  rel.source,
                  rel.target,
                  rel.nature || "unknown",
                  rel.description || null,
                );
              }
            } catch {
              // Skip malformed relationship
              errors.push(`rel_${rel?.source || "?"}-${rel?.target || "?"}`);
            }
          }
        }
      } catch (err) {
        logger.error("[auto-extract] Failed to parse relationship response:", err);
        errors.push("rel_parse");
      }
    }

    // Step 7: Regenerate index
    try {
      generateIndex(wikiRoot);
    } catch (err) {
      logger.error("[auto-extract] Failed to regenerate index:", err);
      errors.push("index_rebuild_failed");
    }

    // Step 8: Append to operation log
    try {
      const details = `Created: ${created.length}, Updated: ${updated.length}, Skipped: ${skipped.length}`;
      appendLog(wikiRoot, "auto-extract", `Session ${sessionId}`, details);
    } catch (err) {
      logger.error("[auto-extract] Failed to append log:", err);
      errors.push("log_append_failed");
    }

    // Step 9: Return summary
    return { created, updated, skipped, errors };
  } catch (err) {
    // Top-level catch — something unexpected happened
    logger.error("[auto-extract] Unexpected top-level error:", err);
    return { created: [], updated: [], skipped: [], errors: ["unexpected_error"] };
  }
}
