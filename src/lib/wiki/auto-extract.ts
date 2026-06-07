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
 * 6. Sort by importance, take top 3, create/update/skip each
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
      const prompt = PROMPTS.extractEntitiesFromResponse(aiResponse, "", existingTitles);
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

    // Step 6: Process entities with max 3 operations
    // Sort by importance: high first, medium second, low last
    entities.sort(
      (a, b) =>
        (IMPORTANCE_ORDER[a.importance] ?? 99) -
        (IMPORTANCE_ORDER[b.importance] ?? 99)
    );

    const maxOps = Math.min(entities.length, 3);
    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < maxOps; i++) {
      const entity = entities[i];

      // Each entity is wrapped in its own try/catch so one failure
      // does not block the others.
      try {
        const sanitizedFilename = sanitizeWikiFilename(entity.name);
        const pagePath = path.join(wikiRoot, ENTITIES_FOLDER, sanitizedFilename);

        if (fs.existsSync(pagePath)) {
          // Page already exists — read frontmatter to decide action
          const existingPage = readWikiPage(pagePath);
          const status = existingPage.frontmatter.status;

          if (status === "draft") {
            // Draft pages get a new session-update section appended
            const dateStr = new Date().toISOString().split("T")[0];
            const updatedContent =
              existingPage.content.trimEnd() +
              `\n\n## Session Update (${dateStr})\n\n${entity.description}`;

            const updatedFrontmatter: WikiFrontmatter = {
              ...existingPage.frontmatter,
              updated: new Date().toISOString(),
            };

            writeWikiPage(pagePath, updatedContent, updatedFrontmatter);
            updated.push(entity.name);
          } else {
            // Non-draft pages (reviewed/locked/rejected) are skipped
            skipped.push(entity.name);
          }
        } else {
          // Page does not exist — create a new one
          const frontmatter: WikiFrontmatter = {
            title: entity.name,
            type: "entity",
            status: "draft",
            tags: ["auto-generated", `type:${entity.type}`, `source:session-${sessionId}`],
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          };

          const content = `${entity.description}\n\n*Auto-extracted during session ${sessionId}*`;
          writeWikiPage(pagePath, content, frontmatter);
          created.push(entity.name);
        }

        // Auto-create NPC record for character-type entities
        if (entity.type === "character") {
          try {
            const existing = getDb().prepare(
              "SELECT id FROM npcs WHERE user_id = ? AND universe_id = ? AND LOWER(name) = LOWER(?)"
            ).get(userId, universeId, entity.name) as { id: string } | undefined;
            if (!existing) {
              getDb().prepare(
                `INSERT INTO npcs (id, user_id, universe_id, name, description, is_canon)
                 VALUES (?, ?, ?, ?, ?, 0)`
              ).run(
                crypto.randomUUID(),
                userId,
                universeId,
                entity.name,
                entity.description || null,
              );
            }
          } catch {
            // Non-fatal — NPC creation is a best-effort bonus
          }
        }
      } catch (err) {
        logger.error(`[auto-extract] Failed to process entity "${entity.name}":`, err);
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
