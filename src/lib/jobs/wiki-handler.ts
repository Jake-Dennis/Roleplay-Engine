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

import crypto from "crypto";
import { getDb } from "@/lib/db";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { CONTENT_LIMITS, TIME } from "@/lib/config";
import { ingestSource } from "@/lib/wiki/ingest";
import { curatePage } from "@/lib/wiki/curate";
import { extractAndCreateWikiEntities } from "@/lib/wiki/auto-extract";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { listWikiPages, writeWikiPage, readWikiPage, WikiFrontmatter } from "@/lib/wiki/file-io";
import { getTypeRegistry } from "@/lib/wiki/type-registry";
import { folderForPage } from "@/lib/wiki/subtype-folders";
import { generateIndex } from "@/lib/wiki/index-generator";
import { recordVersion, createSnapshotFile, getNextVersionNumber } from "@/lib/wiki/history";
// @deprecated: logger.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { appendLog } from "@/lib/wiki/logger";
import fs from "fs";
import path from "path";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";
import { safeParseWarn } from "@/lib/safe-json";

// ---------------------------------------------------------------------------
// Helper: record a version snapshot before modifying a page
// ---------------------------------------------------------------------------

/**
 * Record a version snapshot of a wiki page before it gets overwritten.
 * This ensures AI edits produce version history entries for manual rollback.
 * Non-critical — failures to record are silently caught.
 */
function recordWriteVersion(
  wikiRoot: string,
  pageAbsPath: string,
  userId: string,
  changeSummary: string
): void {
  try {
    const relativePath = path.relative(wikiRoot, pageAbsPath).replace(/\\/g, "/");
    const slug = relativePath.replace(/\.md$/, "").split("/");
    if (!fs.existsSync(pageAbsPath)) return; // Page doesn't exist yet (new file), skip
    const rawContent = fs.readFileSync(pageAbsPath, "utf-8");
    const snapshotPath = createSnapshotFile(wikiRoot, slug, rawContent);
    const versionNumber = getNextVersionNumber(relativePath, userId);
    recordVersion(relativePath, userId, versionNumber, changeSummary, snapshotPath);
  } catch {
    // Non-critical: version recording failure should not block writes
  }
}

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
    case "wiki_create_entity":
      return handleWikiCreateEntity(jobId, payload);
    case "wiki_curate_page":
      return handleWikiCuratePage(jobId, payload);
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
      const enrichment = await generateText(prompt, { temperature: 0.3, userId: userId as string, model: getActiveJobModel(userId as string) });
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
      recordWriteVersion(wikiRoot, page.path, userId as string, "AI enrich");
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
      const rumors = await generateText(prompt, { temperature: 0.5, userId: userId as string, model: getActiveJobModel(userId as string) });

      const filename = `rumor_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
      // Use registry-driven folder resolution
      const registry = getTypeRegistry(wikiRoot);
      const folderFrontmatter = { type: "concept", subtype: "event" };
      const folder = folderForPage(folderFrontmatter, registry);
      const pagePath = path.join(wikiRoot, folder, filename);

      const rumorFrontmatter: WikiFrontmatter = {
        title: `Rumor: ${event.title}`,
        type: "concept",
        status: "draft",
        universe: universeId as string,
        tags: ["rumor", `event:${event.id}`, `type:${event.event_type}`],
        created: new Date().toISOString(),
      };

      writeWikiPage(pagePath, rumors, rumorFrontmatter);
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
      const deepening = await generateText(prompt, { temperature: 0.4, userId: userId as string, model: getActiveJobModel(userId as string) });
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
      recordWriteVersion(wikiRoot, page.path, userId as string, "AI deepen");
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
      const expansion = await generateText(prompt, { temperature: 0.5, userId: userId as string, model: getActiveJobModel(userId as string) });
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
      recordWriteVersion(wikiRoot, page.path, userId as string, "AI deepen location");
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

  // Get session's universeId so event pages go to the right universe subfolder
  const session = db.prepare("SELECT universe_id FROM sessions WHERE id = ?").get(sessionId) as { universe_id: string | null } | undefined;
  const universeId = session?.universe_id || null;
  const wikiRoot = getWikiRoot(userId as string, universeId || undefined);

  // Get recent messages from the session
  const messages = db.prepare(`
    SELECT id, content, sender_id, persona_id, speaking_as, timestamp
    FROM messages
    WHERE session_id = ? AND is_deleted = 0
    ORDER BY timestamp DESC
    LIMIT 10
  `).all(sessionId) as { id: string; content: string; sender_id: string | null; persona_id: string | null; speaking_as: string | null; timestamp: string }[];

  if (messages.length === 0) {
    markJobCompleted(jobId);
    return { success: true, jobId, type: "wiki_extract_event", data: { extractedCount: 0 } };
  }

  const messageText = messages
    .map((m) => {
      if (m.sender_id === null) {
        const speaker = m.speaking_as || "AI";
        return `${speaker}: ${m.content}`;
      }
      if (m.persona_id) {
        const persona = db.prepare("SELECT display_name as name FROM entity_registry WHERE id = ?").get(m.persona_id) as { name: string } | undefined;
        if (persona) return `${persona.name}: ${m.content}`;
      }
      return `Player: ${m.content}`;
    })
    .join("\n");

  const prompt = PROMPTS.extractEvents(messageText);

  let extracted = 0;
  try {
    const response = await generateText(prompt, { temperature: 0.3, userId: userId as string, model: getActiveJobModel(userId as string) });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = safeParseWarn<Record<string, unknown>>(jsonMatch[0], "LLM event extraction");
      if (parsed && Array.isArray(parsed.events)) {
        for (const event of parsed.events) {
          const filename = `event_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
          // Use registry-driven folder resolution
          const registry = getTypeRegistry(wikiRoot);
          const folderFrontmatter = { type: "concept", subtype: "event" };
          const folder = folderForPage(folderFrontmatter, registry);
          const pagePath = path.join(wikiRoot, folder, filename);

          const body = `**Event Type:** ${event.eventType || "other"}\n**Outcome:** ${event.outcome || "Unknown"}\n**Importance:** ${event.importance || "medium"}\n\n## Details\nExtracted from session ${sessionId}.`;

          const eventFrontmatter: WikiFrontmatter = {
            title: `Event: ${event.title || "Unknown Event"}`,
            type: "concept",
            status: "draft",
            universe: universeId || undefined,
            tags: ["event", `type:${event.eventType || "other"}`, `importance:${event.importance || "medium"}`, `source:session-${sessionId}`],
            created: new Date().toISOString(),
          };

          recordWriteVersion(wikiRoot, pagePath, userId as string, "AI event extraction");
          writeWikiPage(pagePath, body, eventFrontmatter);
          extracted++;

          // Auto-create timeline entry for wiki event
          const evTitle = typeof event.title === 'string' ? event.title : "Unknown Event";
          const evOutcome = typeof event.outcome === 'string' ? event.outcome : null;
          const evImportance = typeof event.importance === 'string' ? event.importance : "medium";
          try {
            const entryId = crypto.randomUUID();
            db.prepare(`
              INSERT INTO timeline_entries (id, user_id, universe_id, session_id, thread_id, title, description, occurred_at, entry_type, importance)
              VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'wiki_event', ?)
            `).run(entryId, userId, universeId, sessionId, null, `Event: ${evTitle}`, evOutcome, evImportance);
          } catch {
            // Non-fatal — timeline entry should not block wiki page creation
          }
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

  const expectedTitle = `${name} — Universe Overview`;

  // Try to find the existing universe overview page first
  // Search by title match OR by type+filename+tag heuristics
  const allPages = listWikiPages(wikiRoot);
  const existing = allPages.find((p) => {
    const title = (p.frontmatter?.title || "").trim().toLowerCase();
    if (title === expectedTitle.toLowerCase()) return true;
    // Heuristic: concept-type page named about.md with universe-info tag
    const tags = Array.isArray(p.frontmatter?.tags) ? p.frontmatter.tags : [];
    const filename = path.basename(p.path, ".md");
    return (
      p.frontmatter?.type === "concept" &&
      filename === "about" &&
      tags.includes("universe-info")
    );
  });

  let pagePath: string;
  let relativePagePath: string;

  if (existing) {
    // Update existing page in place (preserves subtype folder structure)
    pagePath = existing.path;
    relativePagePath = path.relative(wikiRoot, existing.path).replace(/\\/g, "/");
    recordWriteVersion(wikiRoot, pagePath, userId as string, "AI create entity");
    writeWikiPage(pagePath, content, {
      ...existing.frontmatter,
      title: expectedTitle,
      updated: new Date().toISOString(),
    });
  } else {
    // Create new page using registry-driven folder
    const registry = getTypeRegistry(wikiRoot);
    const conceptFolder = folderForPage({ type: "concept" }, registry) || "concepts";
    pagePath = path.join(wikiRoot, conceptFolder, "about.md");
    relativePagePath = path.relative(wikiRoot, pagePath).replace(/\\/g, "/");
    writeWikiPage(pagePath, content, {
      title: expectedTitle,
      type: "concept",
      status: "draft",
      tags: ["auto-generated", "universe-info"],
    });
  }

  updateJobProgress(jobId, 70, "Regenerating index...");
  generateIndex(wikiRoot);

  updateJobProgress(jobId, 90, "Emitting SSE event...");
  eventBus.emit(`${SessionEvents.WIKI_PAGE_CREATED}:${universeId}`, {
    universeId,
    page: relativePagePath,
  });

  markJobCompleted(jobId);
  return {
    success: true,
    jobId,
    type: "universe_wiki_sync",
    data: { page: relativePagePath },
  };
}

// ============================================================================
// wiki_create_entity
// Creates a new wiki entity page from extracted data.
// Payload: { userId, universeId, sessionId, name, type, description, importance }
// ============================================================================

async function handleWikiCreateEntity(jobId: string, payload: JobPayload): Promise<JobResult> {
  const userId = payload.userId as string;
  const universeId = payload.universeId as string;
  const name = payload.name as string;
  const entityType = payload.entityType as string || payload.type as string;
  const description = payload.description as string;
  const importance = payload.importance as string;

  if (!userId || !name) {
    throw new Error("Missing required fields: userId, name");
  }

  try {
    updateJobProgress(jobId, 20, "Resolving wiki root...");
    const wikiRoot = getWikiRoot(userId, universeId);
    const entitiesDir = path.join(wikiRoot, "entities");
    const sanitizedFilename = name.replace(/[^a-zA-Z0-9\s_-]/g, "").replace(/\s+/g, "-").toLowerCase();
    const pagePath = path.join(entitiesDir, `${sanitizedFilename}.md`);

    // Ensure entities directory exists
    await fs.promises.mkdir(entitiesDir, { recursive: true });

    updateJobProgress(jobId, 40, "Checking existing page...");

    // Register entity in the entity registry (auxiliary — non-fatal)
    let entityId: string | undefined;
    const registryEntityType = entityType === "character" ? "npc" : entityType === "location" ? "location" : null;
    if (registryEntityType) {
      try {
        const db = getDb();
        const existing = db.prepare(
          "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ?"
        ).get(name, userId) as { id: string } | undefined;
        if (existing) {
          entityId = existing.id;
        } else {
          entityId = `${registryEntityType}:${crypto.randomUUID()}`;
          db.prepare(
            "INSERT INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, ?, ?, ?, ?)"
          ).run(entityId, registryEntityType, name, userId, universeId || null);
          db.prepare(
            "INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'wiki_sync')"
          ).run(crypto.randomUUID(), entityId, name);
        }
      } catch {
        // non-fatal — registry is auxiliary
      }
    }

    // Check if page already exists
    let pageAction: "created" | "updated" | "skipped";
    if (fs.existsSync(pagePath)) {
      const existingPage = readWikiPage(pagePath);
      if (existingPage.frontmatter.status === "draft") {
        // Append session update
        const dateStr = new Date().toISOString().split("T")[0];
        const content = existingPage.content.trimEnd() +
          `\n\n## Session Update (${dateStr})\n\n${description}`;
        recordWriteVersion(wikiRoot, pagePath, userId as string, "AI curation update");
        writeWikiPage(pagePath, content, {
          ...existingPage.frontmatter,
          updated: new Date().toISOString(),
          ...(entityId ? { entity_id: entityId } : {}),
        });
        pageAction = "updated";
      } else {
        pageAction = "skipped";
      }
    } else {
      // Create new page
      const frontmatter: WikiFrontmatter = {
        title: name,
        type: "entity",
        status: "draft",
        tags: ["auto-generated", `type:${entityType}`, `source:session-${payload.sessionId || "unknown"}`],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ...(entityId ? { entity_id: entityId } : {}),
      };
      const content = `${description}\n\n*Auto-extracted during session ${payload.sessionId || "unknown"}*`;
      writeWikiPage(pagePath, content, frontmatter);
      pageAction = "created";
    }

    updateJobProgress(jobId, 70, "Creating NPC record...");

    // Auto-create NPC record for character-type entities
    if (entityType === "character") {
      try {
        const existing = getDb().prepare(
          "SELECT id FROM entity_registry WHERE user_id = ? AND universe_id = ? AND LOWER(display_name) = LOWER(?)"
        ).get(userId, universeId, name) as { id: string } | undefined;
        if (!existing) {
          const newId = `npc:${crypto.randomUUID()}`;
          getDb().prepare(
            `INSERT INTO entity_registry (id, entity_type, display_name, description, user_id, universe_id)
             VALUES (?, 'npc', ?, ?, ?, ?)`
          ).run(newId, name, description || null, userId, universeId);
        }
      } catch {
        // Non-fatal
      }
    }

    // Regenerate wiki index
    updateJobProgress(jobId, 90, "Regenerating index...");
    try {
      generateIndex(wikiRoot);
    } catch {
      // Non-fatal
    }

    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "wiki_create_entity",
      data: { name, action: pageAction },
    };
  } catch (error) {
    // Error will be caught and logged by the job processor
    throw error;
  }
}

// ============================================================================
// wiki_curate_page
// Auto-tag, auto-categorize, and auto-link a single wiki page.
// Payload: { userId, universeId, pagePath }
// ============================================================================

async function handleWikiCuratePage(jobId: string, payload: JobPayload): Promise<JobResult> {
  const userId = payload.userId as string;
  const universeId = payload.universeId as string;
  const pagePath = payload.pagePath as string | undefined;

  if (!userId) {
    throw new Error("Missing required fields: userId");
  }

  // If no specific pagePath, iterate over draft pages that need curation
  if (!pagePath) {
    updateJobProgress(jobId, 10, "Finding pages to curate...");
    const wikiRoot = getWikiRoot(userId, universeId);
    const allPages = listWikiPages(wikiRoot);
    const draftPages = allPages.filter(p =>
      p.frontmatter.status === "draft" &&
      p.frontmatter.type !== "synthesis"
    );

    let totalTagged = 0;
    let totalLinked = 0;
    let errors: string[] = [];

    for (let i = 0; i < draftPages.length; i++) {
      const pct = 10 + Math.round((i / draftPages.length) * 80);
      updateJobProgress(jobId, pct, `Curating ${i + 1}/${draftPages.length}...`);
      const result = await curatePage(userId, universeId, draftPages[i].path);
      totalTagged += result.tagsAdded.length;
      totalLinked += result.wikilinksAdded;
      errors.push(...result.errors);
    }

    updateJobProgress(jobId, 95, "Regenerating index...");
    try { generateIndex(wikiRoot); } catch { /* non-fatal */ }

    markJobCompleted(jobId);
    return {
      success: errors.length === 0,
      jobId,
      type: "wiki_curate_page",
      data: { pagesCurated: draftPages.length, tagsAdded: totalTagged, wikilinksAdded: totalLinked, errors },
    };
  }

  // Curate a single specific page
  updateJobProgress(jobId, 20, "Curating page...");
  const result = await curatePage(userId, universeId, pagePath);

  updateJobProgress(jobId, 90, "Curating complete...");

  markJobCompleted(jobId);
  return {
    success: result.errors.length === 0,
    jobId,
    type: "wiki_curate_page",
    data: {
      tagsAdded: result.tagsAdded,
      typeVerified: result.typeVerified,
      wikilinksAdded: result.wikilinksAdded,
      errors: result.errors,
    },
  };
}
