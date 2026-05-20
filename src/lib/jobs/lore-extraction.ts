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
import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { CONTENT_LIMITS } from "@/lib/config";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { writeWikiPage, sanitizeWikiFilename, WikiFrontmatter } from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { appendLog } from "@/lib/wiki/logger";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";
import { safeParseWarn } from "@/lib/safe-json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
        temperature: 0.3,
        num_ctx: Math.max(CONTENT_LIMITS.MEDIUM, messageText.length + 2000),
        userId: userId as string,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extraction = safeParseWarn<LoreExtractionResult>(jsonMatch[0], "LLM lore extraction");
      }
    } catch {
      // Skip failed batches — continue with next
    }

    if (extraction) {
      // Create entity pages
      for (const entity of extraction.entities) {
        const slug = entity.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
        const pageKey = `entity:${slug}`;
        if (existingPages.has(pageKey)) continue;

        const filename = sanitizeWikiFilename(entity.name);
        const pagePath = path.join(entitiesDir, filename);

        let body = `**Type:** ${entity.entityType}\n`;
        if (entity.traits && entity.traits.length > 0) {
          body += `**Traits:** ${entity.traits.join(", ")}\n`;
        }
        body += `\n## Description\n${entity.description}\n`;
        if (entity.relationships && entity.relationships.length > 0) {
          body += `\n## Relationships\n${entity.relationships.map((r) => `- ${r}`).join("\n")}\n`;
        }
        body += `\n*Extracted from messages (batch ${Math.floor(i / batchSize) + 1}).*`;

        const frontmatter: WikiFrontmatter = {
          title: entity.name,
          type: "entity",
          status: "draft",
          universe: universeId as string,
          tags: ["extracted", `type:${entity.entityType}`],
          created: new Date().toISOString(),
        };

        try {
          writeWikiPage(pagePath, body, frontmatter);
          existingPages.add(pageKey);
          pagesCreated++;
        } catch {
          // Skip failed writes (conflicts, etc.)
        }
      }

      // Create event pages
      for (const event of extraction.events) {
        const slug = event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
        const pageKey = `event:${slug}`;
        if (existingPages.has(pageKey)) continue;

        const filename = `event_${slug}.md`;
        const pagePath = path.join(conceptsDir, filename);

        let body = `**Importance:** ${event.importance}\n`;
        if (event.participants && event.participants.length > 0) {
          body += `**Participants:** ${event.participants.map((p) => `[[${p}]]`).join(", ")}\n`;
        }
        if (event.outcome) {
          body += `**Outcome:** ${event.outcome}\n`;
        }
        body += `\n## Description\n${event.description}\n`;
        body += `\n*Extracted from messages (batch ${Math.floor(i / batchSize) + 1}).*`;

        const frontmatter: WikiFrontmatter = {
          title: `Event: ${event.title}`,
          type: "concept",
          status: "draft",
          universe: universeId as string,
          tags: ["event", "extracted", `importance:${event.importance}`],
          created: new Date().toISOString(),
        };

        try {
          writeWikiPage(pagePath, body, frontmatter);
          existingPages.add(pageKey);
          pagesCreated++;
        } catch {
          // Skip failed writes
        }
      }

      // Create relationship pages
      for (const rel of extraction.relationships) {
        const slug = `${rel.source}-${rel.target}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
        const pageKey = `relationship:${slug}`;
        if (existingPages.has(pageKey)) continue;

        const filename = `relationship_${slug}.md`;
        const pagePath = path.join(conceptsDir, filename);

        const body = `**Nature:** ${rel.nature}\n**Entities:** [[${rel.source}]] ↔ [[${rel.target}]]\n\n## Description\n${rel.description}\n\n*Extracted from messages (batch ${Math.floor(i / batchSize) + 1}).*`;

        const frontmatter: WikiFrontmatter = {
          title: `${rel.source} ↔ ${rel.target}`,
          type: "concept",
          status: "draft",
          universe: universeId as string,
          tags: ["relationship", "extracted", `nature:${rel.nature}`],
          created: new Date().toISOString(),
        };

        try {
          writeWikiPage(pagePath, body, frontmatter);
          existingPages.add(pageKey);
          pagesCreated++;
        } catch {
          // Skip failed writes
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
