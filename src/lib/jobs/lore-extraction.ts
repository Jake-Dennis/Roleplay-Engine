/**
 * Lore Extraction Job Handler
 *
 * Scans ALL messages for a universe and creates draft wiki pages
 * by extracting entities, events, relationships, and locations.
 *
 * Job type: extract_lore_comprehensive
 */

import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { logger } from "@/lib/logger";
import { PROMPTS } from "@/lib/prompts";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { readWikiPage, writeWikiPage, sanitizeWikiFilename, WikiFrontmatter } from "@/lib/wiki/file-io";
import { getTypeRegistry } from "@/lib/wiki/type-registry";
import { folderForPage } from "@/lib/wiki/subtype-folders";
import { generateIndex } from "@/lib/wiki/index-generator";
// @deprecated: logger.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { appendLog } from "@/lib/wiki/logger";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";
import { safeParseWarn } from "@/lib/safe-json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Map LLM entity types to our frontmatter subtype values. */
const ENTITY_TYPE_TO_SUBTYPE: Record<string, string | undefined> = {
  character: "character",
  location: "location",
  organization: "organization",
  object: "item",
  concept: undefined,
};

interface ExtractedEntity {
  name: string;
  entityType: "character" | "location" | "organization" | "object" | "concept";
  description: string;
  traits?: string[];
  relationships?: string[];
}

interface ExtractedEvent {
  title: string;
  description: string;
  participants?: string[];
  outcome?: string;
  importance: "low" | "medium" | "high" | "critical";
}

interface ExtractedRelationship {
  source: string;
  target: string;
  nature: string;
  description: string;
}

interface LoreExtractionResult {
  entities: ExtractedEntity[];
  events: ExtractedEvent[];
  relationships: ExtractedRelationship[];
}

// ---------------------------------------------------------------------------
// Job Handler
// ---------------------------------------------------------------------------

/**
 * extract_lore_comprehensive: Scan all messages for a universe and
 * create draft wiki pages from extracted lore.
 */
export async function handleLoreExtractionJob(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId || !universeId) throw new Error("Missing userId or universeId");

  updateJobProgress(jobId, 10, "Fetching messages...");

  // Fetch all messages for universe via sessions join
  const messages = getDb().prepare(`
    SELECT m.content, m.timestamp, m.sender_id, u.username as sender
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE s.universe_id = ? AND m.is_deleted = 0
    ORDER BY m.timestamp ASC
  `).all(universeId) as { content: string; timestamp: string; sender_id: string | null; sender: string | null }[];

  if (messages.length === 0) {
    markJobCompleted(jobId);
    return { success: true, jobId, type: "extract_lore_comprehensive", data: { pagesCreated: 0, message: "No messages found" } };
  }

  updateJobProgress(jobId, 20, `Analyzing ${messages.length} messages...`);

  const wikiRoot = getWikiRoot(userId as string, universeId as string);
  const batchSize = 20;
  let pagesCreated = 0;
  const existingPages = new Set<string>(); // Track created pages to avoid duplicates

  // Ensure wiki directories exist
  const entitiesDir = path.join(wikiRoot, "entities");
  const conceptsDir = path.join(wikiRoot, "concepts");
  try {
    if (!fs.existsSync(entitiesDir)) fs.mkdirSync(entitiesDir, { recursive: true });
    if (!fs.existsSync(conceptsDir)) fs.mkdirSync(conceptsDir, { recursive: true });
  } catch {
    // Non-fatal — writeWikiPage creates dirs
  }

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const messageText = batch
      .map((m) => `${m.sender || (m.sender_id === null ? "AI" : "Unknown")}: ${m.content}`)
      .join("\n");

    const prompt = PROMPTS.extractLoreComprehensive(messageText);

    let extraction: LoreExtractionResult | null = null;
    try {
      const response = await generateText(prompt, {
        temperature: 0.1,
        num_predict: 1024,
        userId: userId as string,
        model: getActiveJobModel(userId as string),
      });

      logger.warn(`[DEBUG lore-extraction] Response length: ${response?.length || 0}, first 200: ${(response || "''").substring(0, 200)}`);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      logger.warn(`[DEBUG lore-extraction] JSON match: ${jsonMatch ? 'found (len=' + jsonMatch[0].length + ')' : 'NOT FOUND'}`);
      if (jsonMatch) {
        extraction = safeParseWarn<LoreExtractionResult>(jsonMatch[0], "LLM lore extraction");
        logger.warn(`[DEBUG lore-extraction] extraction parsed: ${extraction ? 'entities=' + extraction.entities?.length + ' events=' + extraction.events?.length + ' rels=' + extraction.relationships?.length : 'NULL'}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[DEBUG lore-extraction] Error: ${msg}`);
    }

    if (extraction) {
      // Create entity pages — skip malformed entities individually
      for (const entity of extraction.entities) {
        const entityName = entity?.name;
        if (!entityName) continue;
        try {
          const slug = entityName.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
          const pageKey = `entity:${slug}`;
          if (existingPages.has(pageKey)) continue;

          const filename = sanitizeWikiFilename(entityName);
          // Use registry-driven folder resolution
          const registry = getTypeRegistry(wikiRoot);
          const frontmatter = { type: "entity", subtype: ENTITY_TYPE_TO_SUBTYPE[entity.entityType] };
          const folder = folderForPage(frontmatter, registry);
          const pagePath = path.join(wikiRoot, folder, filename);

          // Create or update wiki page
          if (fs.existsSync(pagePath)) {
            const existingPage = readWikiPage(pagePath);
            if (existingPage.frontmatter.status === "draft") {
              const dateStr = new Date().toISOString().split("T")[0];
              const updatedContent =
                existingPage.content.trimEnd() +
                `\n\n## Session Update (${dateStr})\n\n${entity.description || entityName}`;
              const updatedFrontmatter: WikiFrontmatter = {
                ...existingPage.frontmatter,
                subtype: existingPage.frontmatter.subtype ?? ENTITY_TYPE_TO_SUBTYPE[entity.entityType] as WikiFrontmatter["subtype"] | undefined,
                updated: new Date().toISOString(),
              };
              writeWikiPage(pagePath, updatedContent, updatedFrontmatter);
            } else {
              continue; // Non-draft pages (reviewed/locked) are skipped
            }
          } else {
            let body = `**Type:** ${entity.entityType || "unknown"}\n`;
            if (entity.traits && entity.traits.length > 0) {
              body += `**Traits:** ${entity.traits.join(", ")}\n`;
            }
            body += `\n## Description\n${entity.description || ""}\n`;
            if (entity.relationships && entity.relationships.length > 0) {
              body += `\n## Relationships\n${entity.relationships.map((r) => `- ${r}`).join("\n")}\n`;
            }
            body += `\n*Extracted from messages (batch ${Math.floor(i / batchSize) + 1}).*`;

            const frontmatter: WikiFrontmatter = {
              title: entityName,
              type: "entity",
              subtype: ENTITY_TYPE_TO_SUBTYPE[entity.entityType] as WikiFrontmatter["subtype"] | undefined,
              status: "draft",
              universe: universeId as string,
              tags: ["extracted", `type:${entity.entityType || "unknown"}`],
              created: new Date().toISOString(),
            };

            writeWikiPage(pagePath, body, frontmatter);
          }
          existingPages.add(pageKey);
          pagesCreated++;

          // Auto-create NPC record for character-type entities
          if (entity.entityType === "character") {
            try {
              const existing = getDb().prepare(
                "SELECT id FROM npcs WHERE user_id = ? AND universe_id = ? AND LOWER(name) = LOWER(?)"
              ).get(userId, universeId, entityName) as { id: string } | undefined;
              if (!existing) {
                getDb().prepare(
                  `INSERT INTO npcs (id, user_id, universe_id, name, description, personality_traits, is_canon)
                   VALUES (?, ?, ?, ?, ?, ?, 0)`
                ).run(
                  crypto.randomUUID(),
                  userId,
                  universeId,
                  entityName,
                  entity.description || null,
                  entity.traits?.length ? JSON.stringify(entity.traits) : null,
                );
              }
            } catch {
              // Non-fatal — NPC creation is a best-effort bonus
            }
          }
        } catch {
          // Skip malformed entity — continue with next
        }
      }

      // Create event pages — skip malformed events individually
      for (const event of extraction.events) {
        const eventTitle = event?.title;
        if (!eventTitle) continue;
        try {
          const slug = eventTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
          const pageKey = `event:${slug}`;
          if (existingPages.has(pageKey)) continue;

          const filename = `event_${slug}.md`;
          // Use registry-driven folder resolution
          const registry = getTypeRegistry(wikiRoot);
          const folderFrontmatter = { type: "concept", subtype: "event" };
          const folder = folderForPage(folderFrontmatter, registry);
          const pagePath = path.join(wikiRoot, folder, filename);

          let body = `**Importance:** ${event.importance || "medium"}\n`;
          if (event.participants && event.participants.length > 0) {
            body += `**Participants:** ${event.participants.map((p) => `[[${p}]]`).join(", ")}\n`;
          }
          if (event.outcome) {
            body += `**Outcome:** ${event.outcome}\n`;
          }
          body += `\n## Description\n${event.description || ""}\n`;
          body += `\n*Extracted from messages (batch ${Math.floor(i / batchSize) + 1}).*`;

          const frontmatter: WikiFrontmatter = {
            title: `Event: ${eventTitle}`,
            type: "concept",
            subtype: "event",
            status: "draft",
            universe: universeId as string,
            tags: ["event", "extracted", `importance:${event.importance || "medium"}`],
            created: new Date().toISOString(),
          };

          // Create or update event page
          if (fs.existsSync(pagePath)) {
            const existingPage = readWikiPage(pagePath);
            if (existingPage.frontmatter.status === "draft") {
              const dateStr = new Date().toISOString().split("T")[0];
              const updatedContent =
                existingPage.content.trimEnd() +
                `\n\n## Session Update (${dateStr})\n\n${event.description || ""}`;
              const updatedFrontmatter: WikiFrontmatter = {
                ...existingPage.frontmatter,
                updated: new Date().toISOString(),
              };
              writeWikiPage(pagePath, updatedContent, updatedFrontmatter);
            } else {
              continue; // Non-draft pages (reviewed/locked) are skipped
            }
          } else {
            writeWikiPage(pagePath, body, frontmatter);
          }
          existingPages.add(pageKey);
          pagesCreated++;
        } catch {
          // Skip malformed event — continue with next
        }
      }

      // Create relationship pages — skip malformed relationships individually
      for (const rel of extraction.relationships) {
        if (!rel?.source || !rel?.target) continue;
        try {
          const slug = `${rel.source}-${rel.target}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
          const pageKey = `relationship:${slug}`;
          if (existingPages.has(pageKey)) continue;

          const filename = `relationship_${slug}.md`;
          // Use registry-driven folder resolution
          const registry = getTypeRegistry(wikiRoot);
          const folderFrontmatter = { type: "concept" }; // relationship is concept type
          const folder = folderForPage(folderFrontmatter, registry);
          const pagePath = path.join(wikiRoot, folder, filename);

          // Create or update wiki page
          if (fs.existsSync(pagePath)) {
            const existingPage = readWikiPage(pagePath);
            if (existingPage.frontmatter.status === "draft") {
              const dateStr = new Date().toISOString().split("T")[0];
              const updatedContent =
                existingPage.content.trimEnd() +
                `\n\n## Session Update (${dateStr})\n\n${rel.description || ""}`;
              const updatedFrontmatter: WikiFrontmatter = {
                ...existingPage.frontmatter,
                updated: new Date().toISOString(),
              };
              writeWikiPage(pagePath, updatedContent, updatedFrontmatter);
            } else {
              continue; // Non-draft pages (reviewed/locked) are skipped
            }
          } else {
            const body = `**Nature:** ${rel.nature || "unknown"}\n**Entities:** [[${rel.source}]] ↔ [[${rel.target}]]\n\n## Description\n${rel.description || ""}\n\n*Extracted from messages (batch ${Math.floor(i / batchSize) + 1}).*`;
            const relFrontmatter: WikiFrontmatter = {
              title: `${rel.source} ↔ ${rel.target}`,
              type: "concept",
              status: "draft",
              universe: universeId as string,
              tags: ["relationship", "extracted", `nature:${rel.nature || "unknown"}`],
              created: new Date().toISOString(),
            };
            writeWikiPage(pagePath, body, relFrontmatter);
          }
          existingPages.add(pageKey);
          pagesCreated++;

          // Auto-create relationship record in DB
          try {
            const existing = getDb().prepare(
              "SELECT id FROM relationships WHERE user_id = ? AND universe_id = ? AND LOWER(source_entity) = LOWER(?) AND LOWER(target_entity) = LOWER(?)"
            ).get(userId, universeId, rel.source, rel.target) as { id: string } | undefined;
            if (!existing) {
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
            // Non-fatal — relationship creation is a best-effort bonus
          }
        } catch {
          // Skip malformed relationship — continue with next
        }
      }
    }

    // Progress reporting
    const progress = 20 + Math.round(((i + batchSize) / messages.length) * 70);
    updateJobProgress(
      jobId,
      Math.min(90, progress),
      `Processed ${Math.min(i + batchSize, messages.length)}/${messages.length} messages...`
    );
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "create", "lore_extraction", `Pages created: ${pagesCreated}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "extract_lore_comprehensive",
    data: { pagesCreated, totalMessages: messages.length },
  };
}
