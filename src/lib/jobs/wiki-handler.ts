/**
 * Wiki Job Handlers
 *
 * Handles all wiki-related job types:
 * - wiki_ingest: Ingest source material into wiki pages
 * - wiki_enrich_entity: Enrich existing wiki entity pages
 * - wiki_generate_rumors: Generate rumor pages from recent events
 * - wiki_deepen_page: Deepen existing wiki pages with connections
 * - wiki_deepen_location: Deepen location wiki pages
 * - wiki_extract_event: Extract narrative events from session messages
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { CONTENT_LIMITS, TIME } from "@/lib/config";
import { ingestSource } from "@/lib/wiki/ingest";
import { extractAndCreateWikiEntities } from "@/lib/wiki/auto-extract";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { listWikiPages, writeWikiPage, readWikiPage, WikiFrontmatter } from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { appendLog } from "@/lib/wiki/logger";
import path from "path";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";
import { safeParseWarn } from "@/lib/safe-json";

// ---------------------------------------------------------------------------
// Job Handlers
// ---------------------------------------------------------------------------

/**
 * wiki_ingest: Ingest source material into wiki pages.
 * Maps from: expand_lore
 */
export async function handleWikiJob(jobId: string, payload: JobPayload, jobType: string): Promise<JobResult> {
  switch (jobType) {
    case "wiki_ingest":
      return handleWikiIngest(jobId, payload);
    case "wiki_enrich_entity":
      return handleWikiEnrichEntity(jobId, payload);
    case "wiki_generate_rumors":
      return handleWikiGenerateRumors(jobId, payload);
    case "wiki_deepen_page":
      return handleWikiDeepenPage(jobId, payload);
    case "wiki_deepen_location":
      return handleWikiDeepenLocation(jobId, payload);
    case "wiki_extract_event":
      return handleWikiExtractEvent(jobId, payload);
    case "wiki_auto_extract":
      return handleWikiAutoExtract(jobId, payload);
    case "universe_wiki_sync":
      return handleUniverseWikiSync(jobId, payload);
    default:
      throw new Error(`Unknown wiki job type: ${jobType}`);
  }
}

async function handleWikiIngest(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, sourcePath } = payload;
  if (!userId) throw new Error("Missing userId");
  if (!sourcePath) throw new Error("Missing sourcePath — wiki_ingest requires a source file to ingest");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);

  updateJobProgress(jobId, 20, "Reading source file...");

  const result = await ingestSource(
    sourcePath as string,
    wikiRoot,
    universeId as string
  );
  updateJobProgress(jobId, 80, `Ingested ${result.created.length} pages, updated ${result.updated.length}`);
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_ingest",
    data: { created: result.created.length, updated: result.updated.length, errors: result.errors },
  };
}

async function handleWikiEnrichEntity(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, entityId, entityType } = payload;
  if (!userId) throw new Error("Missing userId");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);
  const pages = listWikiPages(wikiRoot);

  // Filter pages by universe and entity type
  const targetPages = pages.filter((p) => {
    const matchUniverse = !universeId || p.frontmatter.universe === universeId;
    const matchType = !entityType || p.frontmatter.type === entityType;
    const matchEntity = !entityId || p.path.includes(entityId as string);
    return matchUniverse && matchType && matchEntity;
  });

  // If no specific entity, pick top draft entities
  const entitiesToEnrich = targetPages.length > 0
    ? targetPages.slice(0, 3)
    : pages.filter((p) => p.frontmatter.status === "draft").slice(0, 3);

  let processed = 0;
  const totalEntities = entitiesToEnrich.length;

  for (let i = 0; i < entitiesToEnrich.length; i++) {
    const page = entitiesToEnrich[i];
    const title = page.frontmatter.title || page.path;

    const prompt = PROMPTS.wikiEnrichEntity(title, page.content.slice(0, CONTENT_LIMITS.SUMMARY_CHUNK));

    try {
      const enrichment = await generateText(prompt, { userId: userId as string });
      const newContent = page.content.trimEnd() + `\n\n## Additional Details\n${enrichment}`;

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string || title,
        status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        universe: page.frontmatter.universe as string,
        tags: page.frontmatter.tags as string[],
        updated: new Date().toISOString(),
      };

      writeWikiPage(page.path, newContent, updatedFrontmatter);
      processed++;
    } catch {
      // Skip failed entities
    }

    // Progress reporting
    if (totalEntities > 1 && (i + 1) % Math.max(1, Math.floor(totalEntities / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalEntities) * 80), `Enriching ${i + 1}/${totalEntities}...`);
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "update", "batch", `Processed: ${processed}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_enrich_entity",
    data: { processed },
  };
}

async function handleWikiGenerateRumors(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();
  const wikiRoot = getWikiRoot(userId as string, universeId as string);

  // Get recent events from DB (wrapped in try/catch — events table will be dropped in Phase 5)
  let recentEvents: { id: string; title: string; event_type: string; outcome: string | null; occurred_at: string }[] = [];
  try {
    let query = `
      SELECT id, title, event_type, outcome, occurred_at
      FROM events
      WHERE user_id = ? AND occurred_at > datetime('now', '-7 days')
    `;
    const params: (string | number)[] = [userId];

    if (universeId) {
      query += " AND universe_id = ?";
      params.push(universeId);
    }

    query += `
      ORDER BY occurred_at DESC
      LIMIT 5
    `;

    recentEvents = db.prepare(query).all(...params) as {
      id: string;
      title: string;
      event_type: string;
      outcome: string | null;
      occurred_at: string;
    }[];
  } catch {
    // events table may not exist — return 0 processed
    markJobCompleted(jobId);
    return { success: true, jobId, type: "wiki_generate_rumors", data: { processed: 0 } };
  }

  let processed = 0;
  const totalEvents = recentEvents.length;

  for (let i = 0; i < recentEvents.length; i++) {
    const event = recentEvents[i];

    // Check if a rumor page already exists for this event
    const pages = listWikiPages(wikiRoot);
    const existingRumor = pages.find(
      (p) => p.frontmatter.tags?.includes(`event:${event.id}`)
    );
    if (existingRumor) continue;

    const prompt = PROMPTS.wikiGenerateRumors(event.title, event.event_type, event.outcome || "unknown");

    try {
      const rumors = await generateText(prompt, { userId: userId as string });

      const filename = `rumor_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
      const pagePath = `${wikiRoot}/concepts/${filename}`;

      const frontmatter: WikiFrontmatter = {
        title: `Rumor: ${event.title}`,
        type: "concept",
        status: "draft",
        universe: universeId as string,
        tags: ["rumor", `event:${event.id}`, `type:${event.event_type}`],
        created: new Date().toISOString(),
      };

      writeWikiPage(pagePath, rumors, frontmatter);
      processed++;
    } catch {
      // Skip failed events
    }

    // Progress reporting
    if (totalEvents > 2 && (i + 1) % Math.max(1, Math.floor(totalEvents / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalEvents) * 80), `Generating rumors ${i + 1}/${totalEvents}...`);
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "create", "batch", `Processed: ${processed}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_generate_rumors",
    data: { processed },
  };
}

async function handleWikiDeepenPage(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, pagePath } = payload;
  if (!userId) throw new Error("Missing userId");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);

  let pagesToDeepen: ReturnType<typeof listWikiPages> = [];

  if (pagePath) {
    // Deepen a specific page
    try {
      const page = readWikiPage(pagePath as string);
      pagesToDeepen = [page];
    } catch {
      markJobCompleted(jobId);
      return { success: true, jobId, type: "wiki_deepen_page", data: { deepenedCount: 0, error: "Page not found" } };
    }
  } else {
    // Find pages that haven't been deepened recently
    const allPages = listWikiPages(wikiRoot);
    pagesToDeepen = allPages
      .filter((p) => {
        const matchUniverse = !universeId || p.frontmatter.universe === universeId;
        const isOld = !p.frontmatter.updated || new Date(p.frontmatter.updated) < new Date(Date.now() - TIME.THREE_DAYS);
        return matchUniverse && isOld;
      })
      .slice(0, 5);
  }

  let deepened = 0;
  const totalPages = pagesToDeepen.length;

  for (let i = 0; i < pagesToDeepen.length; i++) {
    const page = pagesToDeepen[i];
    const title = page.frontmatter.title || page.path;

    const prompt = PROMPTS.wikiDeepenPage(title, String(page.frontmatter.type), page.content.slice(0, 800));

    try {
      const deepening = await generateText(prompt, { userId: userId as string });
      const newContent = page.content.trimEnd() + `\n\n## Deeper Connections\n${deepening}`;

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string || title,
        status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        universe: page.frontmatter.universe as string,
        tags: page.frontmatter.tags as string[],
        updated: new Date().toISOString(),
      };

      writeWikiPage(page.path, newContent, updatedFrontmatter);
      deepened++;
    } catch {
      // Skip failed pages
    }

    // Progress reporting
    if (totalPages > 1 && (i + 1) % Math.max(1, Math.floor(totalPages / 4)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalPages) * 80), `Deepening ${i + 1}/${totalPages}...`);
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "update", "batch", `Deepened: ${deepened}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_deepen_page",
    data: { deepenedCount: deepened },
  };
}

async function handleWikiDeepenLocation(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, locationId } = payload;
  if (!userId) throw new Error("Missing userId");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);
  const pages = listWikiPages(wikiRoot);

  // Filter for location-type pages
  let locationPages = pages.filter((p) => {
    const matchUniverse = !universeId || p.frontmatter.universe === universeId;
    const isEntity = p.frontmatter.type === "entity";
    const matchLocation = locationId
      ? p.path.includes(locationId as string)
      : true;
    return matchUniverse && isEntity && matchLocation;
  }).slice(0, 3);

  // If no location-specific pages found, fall back to any entity pages
  if (locationPages.length === 0 && !locationId) {
    locationPages = pages
      .filter((p) => !universeId || p.frontmatter.universe === universeId)
      .slice(0, 3);
  }

  let expanded = 0;

  for (const page of locationPages) {
    const title = page.frontmatter.title || page.path;
    const existingContent = page.content;
    if (!existingContent.trim()) continue;

    const prompt = PROMPTS.wikiExpandLocation(title, existingContent.slice(0, 500));

    try {
      const expansion = await generateText(prompt, { userId: userId as string });
      const newContent = existingContent.trimEnd() + `\n\n## Additional Lore\n${expansion}`;

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string || title,
        status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        universe: page.frontmatter.universe as string,
        tags: page.frontmatter.tags as string[],
        updated: new Date().toISOString(),
      };

      writeWikiPage(page.path, newContent, updatedFrontmatter);
      expanded++;
    } catch {
      // Skip failed locations
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "update", "batch", `Expanded: ${expanded}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_deepen_location",
    data: { expandedCount: expanded },
  };
}

async function handleWikiExtractEvent(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  const db = getDb();
  const wikiRoot = getWikiRoot(userId as string);

  // Get recent messages from the session
  const messages = db.prepare(`
    SELECT id, content, sender_id, timestamp
    FROM messages
    WHERE session_id = ? AND is_deleted = 0
    ORDER BY timestamp DESC
    LIMIT 10
  `).all(sessionId) as { id: string; content: string; sender_id: string | null; timestamp: string }[];

  if (messages.length === 0) {
    markJobCompleted(jobId);
    return { success: true, jobId, type: "wiki_extract_event", data: { extractedCount: 0 } };
  }

  const messageText = messages
    .map((m) => `${m.sender_id === null ? "AI" : "Player"}: ${m.content}`)
    .join("\n");

  const prompt = PROMPTS.extractEvents(messageText);

  let extracted = 0;
  try {
    const response = await generateText(prompt, { temperature: 0.3, num_ctx: 4096, userId: userId as string });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = safeParseWarn<Record<string, unknown>>(jsonMatch[0], "LLM event extraction");
      if (parsed && Array.isArray(parsed.events)) {
        for (const event of parsed.events) {
          const filename = `event_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
          const pagePath = `${wikiRoot}/concepts/${filename}`;

          const body = `**Event Type:** ${event.eventType || "other"}\n**Outcome:** ${event.outcome || "Unknown"}\n**Importance:** ${event.importance || "medium"}\n\n## Details\nExtracted from session ${sessionId}.`;

          const frontmatter: WikiFrontmatter = {
            title: `Event: ${event.title || "Unknown Event"}`,
            type: "concept",
            status: "draft",
            tags: ["event", `type:${event.eventType || "other"}`, `importance:${event.importance || "medium"}`, `session:${sessionId}`],
            created: new Date().toISOString(),
          };

          writeWikiPage(pagePath, body, frontmatter);
          extracted++;
        }
      }
    }
  } catch {
    // Skip if extraction fails
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "create", sessionId as string, `Extracted: ${extracted}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_extract_event",
    data: { extractedCount: extracted },
  };
}

async function handleWikiAutoExtract(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId, universeId, content } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  updateJobProgress(jobId, 20, "Extracting wiki entities...");
  const result = await extractAndCreateWikiEntities(
    sessionId as string,
    userId as string,
    (universeId as string) || null,
    (content as string) || ""
  );
  updateJobProgress(jobId, 80, `Created ${result.created.length}, updated ${result.updated.length}`);

  // Emit SSE events so UI gets real-time toast notifications
  if (result.created.length > 0 || result.updated.length > 0) {
    eventBus.emit(`${SessionEvents.WIKI_PAGE_CREATED}:${sessionId}`, {
      sessionId,
      created: result.created,
      updated: result.updated,
    });
  }

  markJobCompleted(jobId);
  return {
    success: true,
    jobId,
    type: "wiki_auto_extract",
    data: { created: result.created.length, updated: result.updated.length },
  };
}

/**
 * universe_wiki_sync: Create or update the universe overview wiki page
 * using the universe's name, description, tone, lore_source, and boundaries.
 */
async function handleUniverseWikiSync(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId || !universeId) throw new Error("Missing userId or universeId");

  updateJobProgress(jobId, 20, "Reading universe data...");

  const db = getDb();
  const universe = db.prepare(
    "SELECT id, name, description, tone, lore_source, boundaries FROM universes WHERE id = ? AND user_id = ?"
  ).get(universeId as string, userId as string) as Record<string, unknown> | undefined;

  if (!universe) {
    throw new Error(`Universe not found: ${universeId}`);
  }

  updateJobProgress(jobId, 40, "Building wiki page...");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);
  const name = (universe.name as string) || "Unknown";
  const description = (universe.description as string) || "";
  const tone = (universe.tone as string) || "";
  const loreSource = (universe.lore_source as string) || "";

  // Parse boundaries from JSON string
  let boundariesText = "";
  try {
    const raw = universe.boundaries as string | null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        boundariesText = parsed.map((b: string) => `- ${b}`).join("\n");
      }
    }
  } catch { /* not a JSON array — ignore */ }

  // Build markdown content from universe fields
  const content = [
    `## ${name}`,
    ``,
    description ? `${description}\n` : "",
    tone ? `**Tone:** ${tone}\n` : "",
    loreSource ? `**Lore Source:** ${loreSource}\n` : "",
    boundariesText ? `**Boundaries:**\n${boundariesText}\n` : "",
  ].filter(Boolean).join("\n");

  const pagePath = path.join(wikiRoot, "concepts", "about.md");
  writeWikiPage(pagePath, content, {
    title: `${name} — Universe Overview`,
    type: "concept",
    status: "draft",
    tags: ["auto-generated", "universe-info"],
  });

  updateJobProgress(jobId, 70, "Regenerating index...");
  generateIndex(wikiRoot);

  updateJobProgress(jobId, 90, "Emitting SSE event...");
  eventBus.emit(`${SessionEvents.WIKI_PAGE_CREATED}:${universeId}`, {
    universeId,
    page: "concepts/about.md",
  });

  markJobCompleted(jobId);
  return {
    success: true,
    jobId,
    type: "universe_wiki_sync",
    data: { page: "concepts/about.md" },
  };
}
