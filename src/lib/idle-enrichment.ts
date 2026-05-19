/**
 * Idle-Time Enrichment Workers
 * 
 * Background enrichment operations triggered by user inactivity.
 * Complements idle-processing.ts by providing focused enrichment functions
 * that can be called from job handlers or idle-time processing tiers.
 * 
 * Enrichment tiers:
 * | Idle Duration | Actions |
 * |---------------|---------|
 * | > 5 min | compressOldSummaries(), refineRelationshipSummaries() |
 * | > 10 min | deepenActiveLocations(), enrichNPCBackstories(), optimizeRetrievalIndexes() |
 * | > 15 min | expandRumors(), archiveLowImportanceMemories() |
 * | > 30 min | applyRelationshipDecay() |
 * 
 * When WIKI_JOBS=true, wiki-first operations are used with DB fallback.
 * 
 * Constraints:
 * - Only enrich entities with importance score ≥ 5
 * - Never contradict immutable_canon
 * - Generated content starts as generated_unverified
 * - Additive only (except archival)
 * - All enrichment logged
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { processSummarization, needsSummarization } from "@/lib/summarization";
import { processRelationshipDecay, needsDecayProcessing } from "@/lib/relationship-decay";
import { getArchivalCandidates } from "@/lib/importance-scoring";

// Wiki I/O modules
import { listWikiPages, writeWikiPage, readWikiPage, WikiFrontmatter } from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { appendLog } from "@/lib/wiki/logger";
import path from "path";
import fs from "fs";

export interface EnrichmentResult {
  tier: number;
  actionsCompleted: string[];
  itemsProcessed: number;
  // Wiki-specific metrics
  wikiPagesUpdated: number;
  wikiPagesCreated: number;
  wikiPagesArchived: number;
}

// ---------------------------------------------------------------------------
// Wiki Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the wiki root directory for a user/universe.
 */
function getWikiRoot(userId: string, universeId?: string): string {
  const dataDir = process.env.DATA_DIR || "./data";
  return universeId
    ? `${dataDir}/${userId}/wiki/${universeId}`
    : `${dataDir}/${userId}/wiki`;
}

/**
 * Tier 1 (wiki): Compress old wiki summaries by summarizing stale draft pages.
 */
async function wikiCompressOldSummaries(userId: string, universeId: string | null): Promise<number> {
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) return 0;

  const pages = listWikiPages(wikiRoot);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let compressed = 0;

  for (const page of pages.slice(0, 10)) {
    const created = page.frontmatter.created ? new Date(page.frontmatter.created).getTime() : 0;
    const updated = page.frontmatter.updated ? new Date(page.frontmatter.updated).getTime() : 0;
    const lastActivity = Math.max(created, updated);

    if (lastActivity > 0 && lastActivity < sevenDaysAgo && page.frontmatter.status === "draft") {
      try {
        const prompt = `Summarize this wiki page in 2-3 sentences:\n${page.content.slice(0, 500)}`;
        const summary = await generateText(prompt, { temperature: 0.2, num_ctx: 2048, userId });

        const updatedFrontmatter: WikiFrontmatter = {
          title: page.frontmatter.title as string || path.basename(page.path, ".md"),
          type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
          status: "reviewed",
          universe: page.frontmatter.universe as string,
          tags: [...(page.frontmatter.tags as string[] || []), "compressed"],
          created: page.frontmatter.created,
          updated: new Date().toISOString(),
        };

        const newContent = `> **Compressed Summary:** ${summary}\n\n---\n\n${page.content}`;
        writeWikiPage(page.path, newContent, updatedFrontmatter);
        compressed++;
      } catch {
        // Skip failed pages
      }
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return compressed;
}

/**
 * Tier 1 (wiki): Refine relationship wiki pages with recent interaction summaries.
 */
async function wikiRefineRelationshipSummaries(userId: string, universeId: string | null): Promise<number> {
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) return 0;

  const db = getDb();
  let query = `
    SELECT r.id, r.source_entity, r.target_entity, r.emotional_state, r.shared_history
    FROM relationships r
    WHERE r.user_id = ?
  `;
  const params: (string | number)[] = [userId];
  if (universeId) {
    query += " AND r.universe_id = ?";
    params.push(universeId);
  }
  query += " LIMIT 5";

  const relationships = db.prepare(query).all(...params) as {
    id: string; source_entity: string; target_entity: string;
    emotional_state: string | null; shared_history: string | null;
  }[];

  let refined = 0;
  const pages = listWikiPages(wikiRoot);

  for (const rel of relationships) {
    const emotions = rel.emotional_state ? JSON.parse(rel.emotional_state) : {};
    const history = rel.shared_history ? JSON.parse(rel.shared_history) : [];

    const emotionSummary = Object.entries(emotions)
      .filter(([, v]) => (v as number) > 0.3)
      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}`)
      .join(", ");

    const relPage = pages.find(
      (p) => p.frontmatter.title?.toLowerCase().includes(rel.source_entity.toLowerCase()) &&
             p.frontmatter.title?.toLowerCase().includes(rel.target_entity.toLowerCase())
    );

    const prompt = `Summarize the relationship between ${rel.source_entity} and ${rel.target_entity}.
Current emotional state: ${emotionSummary || "neutral"}
Recent history: ${history.slice(-3).map((h: any) => h.summary || h).join("; ")}

Write a 2-3 sentence narrative summary of their current relationship dynamic.`;

    try {
      const summary = await generateText(prompt, { userId });

      if (relPage) {
        const newContent = relPage.content.trimEnd() + `\n\n## Recent Update\n${summary}`;
        const updatedFrontmatter: WikiFrontmatter = {
          title: relPage.frontmatter.title as string,
          type: (relPage.frontmatter.type as WikiFrontmatter["type"]) || "synthesis",
          status: (relPage.frontmatter.status as WikiFrontmatter["status"]) || "draft",
          universe: relPage.frontmatter.universe as string,
          tags: [...(relPage.frontmatter.tags as string[] || []), "relationship-updated"],
          created: relPage.frontmatter.created,
          updated: new Date().toISOString(),
        };
        writeWikiPage(relPage.path, newContent, updatedFrontmatter);
      } else {
        const filename = `relationship_${rel.source_entity.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}_${rel.target_entity.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}.md`;
        const pagePath = path.join(wikiRoot, "synthesis", filename);
        const frontmatter: WikiFrontmatter = {
          title: `Relationship: ${rel.source_entity} & ${rel.target_entity}`,
          type: "synthesis",
          status: "draft",
          universe: universeId || undefined,
          tags: ["relationship", `entity:${rel.source_entity}`, `entity:${rel.target_entity}`],
          created: new Date().toISOString(),
        };
        writeWikiPage(pagePath, summary, frontmatter);
      }
      refined++;
    } catch {
      // Skip failed relationships
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return refined;
}

/**
 * Tier 2 (wiki): Deepen active location wiki pages with atmospheric details.
 */
async function wikiDeepenActiveLocations(userId: string, universeId: string | null): Promise<number> {
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) return 0;

  const pages = listWikiPages(wikiRoot);
  const locationPages = pages
    .filter((p) => {
      const matchUniverse = !universeId || p.frontmatter.universe === universeId;
      const isEntity = p.frontmatter.type === "entity";
      return matchUniverse && isEntity;
    })
    .slice(0, 3);

  let deepened = 0;

  for (const page of locationPages) {
    const title = page.frontmatter.title || path.basename(page.path, ".md");
    const existingContent = page.content;
    if (!existingContent.trim()) continue;

    const prompt = `Expand on this location "${title}". Current description:\n${existingContent.slice(0, 500)}\n\nAdd 2-3 new atmospheric details, historical notes, or sensory descriptions. Do not contradict existing facts.`;

    try {
      const expansion = await generateText(prompt, { userId });
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
      deepened++;
    } catch {
      // Skip failed locations
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return deepened;
}

/**
 * Tier 2 (wiki): Enrich NPC wiki pages with new backstory details.
 */
async function wikiEnrichNPCBackstories(userId: string, universeId: string | null): Promise<number> {
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) return 0;

  const pages = listWikiPages(wikiRoot);
  const npcPages = pages
    .filter((p) => {
      const matchUniverse = !universeId || p.frontmatter.universe === universeId;
      const isEntity = p.frontmatter.type === "entity";
      const tags = p.frontmatter.tags as string[] || [];
      const isNPC = tags.some((t) => t.startsWith("type:npc") || t.startsWith("type:character"));
      return matchUniverse && isEntity && isNPC;
    })
    .slice(0, 3);

  // Fallback: if no NPC-tagged pages, use any entity pages
  const pagesToEnrich = npcPages.length > 0
    ? npcPages
    : pages
        .filter((p) => {
          const matchUniverse = !universeId || p.frontmatter.universe === universeId;
          return matchUniverse && p.frontmatter.type === "entity";
        })
        .slice(0, 3);

  let enriched = 0;

  for (const page of pagesToEnrich) {
    const title = page.frontmatter.title || path.basename(page.path, ".md");
    const prompt = `Expand on this wiki entity "${title}". Current content:\n${page.content.slice(0, 1000)}\n\nAdd 2-3 new details about their personality, habits, or hidden motivations. Do not contradict existing facts. Return only the new content as markdown.`;

    try {
      const enrichment = await generateText(prompt, { userId });
      const newContent = page.content.trimEnd() + `\n\n## Recent Observations\n${enrichment}`;

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string || title,
        status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        universe: page.frontmatter.universe as string,
        tags: [...(page.frontmatter.tags as string[] || []), "enriched"],
        updated: new Date().toISOString(),
      };

      writeWikiPage(page.path, newContent, updatedFrontmatter);
      enriched++;
    } catch {
      // Skip failed NPCs
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return enriched;
}

/**
 * Tier 3 (wiki): Generate rumor pages from recent events.
 */
async function wikiExpandRumors(userId: string, universeId: string | null): Promise<number> {
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) return 0;

  const db = getDb();
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
  query += " ORDER BY occurred_at DESC LIMIT 5";

  const recentEvents = db.prepare(query).all(...params) as {
    id: string; title: string; event_type: string; outcome: string | null; occurred_at: string;
  }[];

  let generated = 0;
  const existingPages = listWikiPages(wikiRoot);

  for (const event of recentEvents) {
    const existingRumor = existingPages.find(
      (p) => p.frontmatter.tags?.includes(`event:${event.id}`)
    );
    if (existingRumor) continue;

    const prompt = `Based on this event: "${event.title}" (${event.event_type}, outcome: ${event.outcome || "unknown"}), generate 1-2 rumors that might spread among NPCs. Rumors should be plausible but potentially inaccurate. Return as bullet points.`;

    try {
      const rumors = await generateText(prompt, { userId });
      const filename = `rumor_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
      const pagePath = path.join(wikiRoot, "concepts", filename);

      const frontmatter: WikiFrontmatter = {
        title: `Rumor: ${event.title}`,
        type: "concept",
        status: "draft",
        universe: universeId || undefined,
        tags: ["rumor", `event:${event.id}`, `type:${event.event_type}`],
        created: new Date().toISOString(),
      };

      writeWikiPage(pagePath, rumors, frontmatter);
      generated++;
    } catch {
      // Skip failed events
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return generated;
}

/**
 * Tier 3 (wiki): Archive low-importance wiki pages.
 */
async function wikiArchiveLowImportanceMemories(userId: string, universeId: string | null): Promise<number> {
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) return 0;

  const pages = listWikiPages(wikiRoot);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const archiveCandidates = pages
    .filter((p) => {
      const matchUniverse = !universeId || p.frontmatter.universe === universeId;
      const created = p.frontmatter.created ? new Date(p.frontmatter.created).getTime() : 0;
      const updated = p.frontmatter.updated ? new Date(p.frontmatter.updated).getTime() : 0;
      const lastActivity = Math.max(created, updated);
      return matchUniverse && p.frontmatter.status === "draft" && lastActivity > 0 && lastActivity < thirtyDaysAgo;
    })
    .slice(0, 10);

  let archived = 0;

  for (const page of archiveCandidates) {
    try {
      const prompt = `Summarize this wiki page in one sentence: "${page.content.slice(0, 300)}"`;
      const summary = await generateText(prompt, { temperature: 0.2, num_ctx: 2048, userId });

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string,
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        status: "rejected",
        universe: page.frontmatter.universe as string,
        tags: [...(page.frontmatter.tags as string[] || []), "archived"],
        created: page.frontmatter.created,
        updated: new Date().toISOString(),
      };

      const newContent = `> **Archived:** ${summary}\n\n---\n\n${page.content}`;
      writeWikiPage(page.path, newContent, updatedFrontmatter);
      archived++;
    } catch {
      // Skip failed pages
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  try { appendLog(wikiRoot, "update", "batch", `Archived: ${archived}`); } catch { /* non-fatal */ }
  return archived;
}

/**
 * Tier 4 (wiki): Apply relationship decay to wiki relationship pages.
 */
async function wikiApplyRelationshipDecay(userId: string, universeId: string | null): Promise<number> {
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) return 0;

  const db = getDb();
  let query = `
    SELECT r.id, r.source_entity, r.target_entity, r.emotional_state, r.relationship_stage,
           r.decay_rates, r.updated_at
    FROM relationships r
    WHERE r.user_id = ?
  `;
  const params: (string | number)[] = [userId];
  if (universeId) {
    query += " AND r.universe_id = ?";
    params.push(universeId);
  }

  const relationships = db.prepare(query).all(...params) as {
    id: string; source_entity: string; target_entity: string;
    emotional_state: string | null; relationship_stage: string | null;
    decay_rates: string | null; updated_at: string | null;
  }[];

  const DEFAULT_DECAY_RATES = { emotionalHalfLifeDays: 7, stageRegressionDays: 14, minEmotionalState: "neutral" };
  const EMOTIONAL_STATES = ["devoted", "loving", "trusting", "friendly", "warm", "neutral", "cold", "distant", "suspicious", "hostile", "hateful"] as const;
  const RELATIONSHIP_STAGES = ["lovers", "close_friends", "friends", "allies", "acquaintances", "strangers"] as const;

  let decayed = 0;
  const pages = listWikiPages(wikiRoot);

  for (const rel of relationships) {
    const rates = rel.decay_rates ? { ...DEFAULT_DECAY_RATES, ...JSON.parse(rel.decay_rates) } : DEFAULT_DECAY_RATES;
    const lastUpdate = rel.updated_at ? new Date(rel.updated_at) : new Date();
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 1) continue;

    const previousState = rel.emotional_state || "neutral";
    const previousStage = rel.relationship_stage || "acquaintances";

    const ci = EMOTIONAL_STATES.indexOf(previousState as typeof EMOTIONAL_STATES[number]);
    const ni = EMOTIONAL_STATES.indexOf("neutral");
    const mi = EMOTIONAL_STATES.indexOf(rates.minEmotionalState as typeof EMOTIONAL_STATES[number]);
    const halfLives = daysSinceUpdate / rates.emotionalHalfLifeDays;
    const steps = Math.floor(halfLives);
    let newState = previousState;
    if (steps > 0 && ci !== -1) {
      let idx = ci < ni ? Math.min(ci + steps, ni) : ci > ni ? Math.max(ci - steps, ni) : ni;
      idx = Math.max(idx, mi);
      newState = EMOTIONAL_STATES[idx];
    }

    const si = RELATIONSHIP_STAGES.indexOf(previousStage as typeof RELATIONSHIP_STAGES[number]);
    const sri = RELATIONSHIP_STAGES.indexOf("strangers");
    const periods = daysSinceUpdate / rates.stageRegressionDays;
    const rSteps = Math.floor(periods);
    let newStage = previousStage;
    if (rSteps > 0 && si !== -1) newStage = RELATIONSHIP_STAGES[Math.min(si + rSteps, sri)];

    if (newState !== previousState || newStage !== previousStage) {
      // Update DB
      try {
        db.prepare("UPDATE relationships SET emotional_state = ?, relationship_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newState, newStage, rel.id);
      } catch { /* skip */ }

      // Update wiki page
      const relPage = pages.find(
        (p) => p.frontmatter.title?.toLowerCase().includes(rel.source_entity.toLowerCase()) &&
               p.frontmatter.title?.toLowerCase().includes(rel.target_entity.toLowerCase())
      );

      if (relPage) {
        try {
          const decayNote = `\n\n## Decay Update (${new Date().toISOString().split("T")[0]})\n- Emotional state: ${previousState} → ${newState}\n- Stage: ${previousStage} → ${newStage}\n- Days since last interaction: ${Math.round(daysSinceUpdate)}`;
          const newContent = relPage.content.trimEnd() + decayNote;

          const updatedFrontmatter: WikiFrontmatter = {
            title: relPage.frontmatter.title as string,
            type: (relPage.frontmatter.type as WikiFrontmatter["type"]) || "synthesis",
            status: (relPage.frontmatter.status as WikiFrontmatter["status"]) || "draft",
            universe: relPage.frontmatter.universe as string,
            tags: [...(relPage.frontmatter.tags as string[] || []), "decayed"],
            created: relPage.frontmatter.created,
            updated: new Date().toISOString(),
          };
          writeWikiPage(relPage.path, newContent, updatedFrontmatter);
        } catch {
          // Skip wiki update failure
        }
      }

      decayed++;
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return decayed;
}

// ---------------------------------------------------------------------------
// Main Enrichment Runner
// ---------------------------------------------------------------------------

/**
 * Run idle enrichment based on how long the user has been inactive.
 */
export async function runIdleEnrichment(
  userId: string,
  idleMinutes: number,
  universeId: string | null = null
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    tier: 0,
    actionsCompleted: [],
    itemsProcessed: 0,
    wikiPagesUpdated: 0,
    wikiPagesCreated: 0,
    wikiPagesArchived: 0,
  };

  if (idleMinutes < 5) return result;

  const useWiki = process.env.WIKI_JOBS === "true";

  // Tier 1: > 5 minutes
  if (idleMinutes >= 5) {
    result.tier = 1;

    if (useWiki) {
      // Wiki-first: compress old summaries + refine relationships
      const wikiCompressed = await wikiCompressOldSummaries(userId, universeId);
      if (wikiCompressed > 0) {
        result.actionsCompleted.push("wikiCompressOldSummaries");
        result.itemsProcessed += wikiCompressed;
        result.wikiPagesUpdated += wikiCompressed;
      }

      const wikiRefined = await wikiRefineRelationshipSummaries(userId, universeId);
      if (wikiRefined > 0) {
        result.actionsCompleted.push("wikiRefineRelationshipSummaries");
        result.itemsProcessed += wikiRefined;
        result.wikiPagesCreated += wikiRefined;
      }
    }

    // DB fallback (always runs)
    const compressed = await compressOldSummaries(userId, universeId);
    if (compressed > 0 && !result.actionsCompleted.includes("wikiCompressOldSummaries")) {
      result.actionsCompleted.push("compressOldSummaries");
      result.itemsProcessed += compressed;
    }

    const refined = await refineRelationshipSummaries(userId, universeId);
    if (refined > 0 && !result.actionsCompleted.includes("wikiRefineRelationshipSummaries")) {
      result.actionsCompleted.push("refineRelationshipSummaries");
      result.itemsProcessed += refined;
    }
  }

  // Tier 2: > 10 minutes
  if (idleMinutes >= 10) {
    result.tier = 2;

    if (useWiki) {
      // Wiki-first: deepen locations + enrich NPCs
      const wikiDeepened = await wikiDeepenActiveLocations(userId, universeId);
      if (wikiDeepened > 0) {
        result.actionsCompleted.push("wikiDeepenActiveLocations");
        result.itemsProcessed += wikiDeepened;
        result.wikiPagesUpdated += wikiDeepened;
      }

      const wikiEnriched = await wikiEnrichNPCBackstories(userId, universeId);
      if (wikiEnriched > 0) {
        result.actionsCompleted.push("wikiEnrichNPCBackstories");
        result.itemsProcessed += wikiEnriched;
        result.wikiPagesUpdated += wikiEnriched;
      }
    }

    // DB fallback (always runs)
    const deepened = await deepenActiveLocations(userId, universeId);
    if (deepened > 0 && !result.actionsCompleted.includes("wikiDeepenActiveLocations")) {
      result.actionsCompleted.push("deepenActiveLocations");
      result.itemsProcessed += deepened;
    }

    const enriched = await enrichNPCBackstories(userId, universeId);
    if (enriched > 0 && !result.actionsCompleted.includes("wikiEnrichNPCBackstories")) {
      result.actionsCompleted.push("enrichNPCBackstories");
      result.itemsProcessed += enriched;
    }
  }

  // Tier 3: > 15 minutes
  if (idleMinutes >= 15) {
    result.tier = 3;

    if (useWiki) {
      // Wiki-first: expand rumors + archive
      const wikiRumors = await wikiExpandRumors(userId, universeId);
      if (wikiRumors > 0) {
        result.actionsCompleted.push("wikiExpandRumors");
        result.itemsProcessed += wikiRumors;
        result.wikiPagesCreated += wikiRumors;
      }

      const wikiArchived = await wikiArchiveLowImportanceMemories(userId, universeId);
      if (wikiArchived > 0) {
        result.actionsCompleted.push("wikiArchiveLowImportanceMemories");
        result.itemsProcessed += wikiArchived;
        result.wikiPagesArchived += wikiArchived;
      }
    }

    // DB fallback (always runs)
    const rumors = await expandRumors(userId, universeId);
    if (rumors > 0 && !result.actionsCompleted.includes("wikiExpandRumors")) {
      result.actionsCompleted.push("expandRumors");
      result.itemsProcessed += rumors;
    }

    const archived = await archiveLowImportanceMemories(userId, universeId);
    if (archived > 0 && !result.actionsCompleted.includes("wikiArchiveLowImportanceMemories")) {
      result.actionsCompleted.push("archiveLowImportanceMemories");
      result.itemsProcessed += archived;
    }
  }

  // Tier 4: > 30 minutes
  if (idleMinutes >= 30) {
    result.tier = 4;

    if (useWiki) {
      // Wiki-first: decay relationships via wiki
      const wikiDecayed = await wikiApplyRelationshipDecay(userId, universeId);
      if (wikiDecayed > 0) {
        result.actionsCompleted.push("wikiApplyRelationshipDecay");
        result.itemsProcessed += wikiDecayed;
        result.wikiPagesUpdated += wikiDecayed;
      }
    }

    // DB fallback (always runs)
    if (needsDecayProcessing(userId)) {
      const decayResult = processRelationshipDecay(userId);
      if (decayResult.decayedCount > 0 && !result.actionsCompleted.includes("wikiApplyRelationshipDecay")) {
        result.actionsCompleted.push("applyRelationshipDecay");
        result.itemsProcessed += decayResult.decayedCount;
      }
    }
  }

  return result;
}

/**
 * Compress old message summaries that haven't been accessed recently.
 */
async function compressOldSummaries(userId: string, universeId: string | null): Promise<number> {
  const db = getDb();

  // Find sessions needing summarization
  let query = `
    SELECT s.id
    FROM sessions s
    WHERE s.owner_id = ? AND s.status = 'active'
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND s.universe_id = ?";
    params.push(universeId);
  }

  const sessions = db.prepare(query).all(...params) as { id: string }[];

  let compressed = 0;
  for (const session of sessions.slice(0, 3)) {
    if (needsSummarization(session.id)) {
      try {
        const result = await processSummarization(session.id);
        compressed += result.summarizedCount;
      } catch {
        // Skip failed sessions
      }
    }
  }

  return compressed;
}

/**
 * Refine relationship summaries by analyzing recent interactions.
 */
async function refineRelationshipSummaries(userId: string, universeId: string | null): Promise<number> {
  const db = getDb();

  let query = `
    SELECT r.id, r.source_entity, r.target_entity, r.emotional_state, r.shared_history
    FROM relationships r
    WHERE r.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND r.universe_id = ?";
    params.push(universeId);
  }

  query += " LIMIT 5";

  const relationships = db.prepare(query).all(...params) as {
    id: string;
    source_entity: string;
    target_entity: string;
    emotional_state: string | null;
    shared_history: string | null;
  }[];

  let refined = 0;
  for (const rel of relationships) {
    const emotions = rel.emotional_state ? JSON.parse(rel.emotional_state) : {};
    const history = rel.shared_history ? JSON.parse(rel.shared_history) : [];

    const emotionSummary = Object.entries(emotions)
      .filter(([, v]) => (v as number) > 0.3)
      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}`)
      .join(", ");

    const prompt = `Summarize the relationship between ${rel.source_entity} and ${rel.target_entity}.
Current emotional state: ${emotionSummary || "neutral"}
Recent history: ${history.slice(-3).map((h: any) => h.summary || h).join("; ")}

Write a 2-3 sentence narrative summary of their current relationship dynamic.`;

    try {
      const summary = await generateText(prompt, { userId });
      db.prepare(
        "UPDATE relationships SET shared_history = ? WHERE id = ?"
      ).run(
        JSON.stringify([...history, { type: "summary", summary, at: new Date().toISOString() }]),
        rel.id
      );
      refined++;
    } catch {
      // Skip failed relationships
    }
  }

  return refined;
}

/**
 * Deepen active locations by generating additional lore details.
 */
async function deepenActiveLocations(userId: string, universeId: string | null): Promise<number> {
  const db = getDb();

  let query = `
    SELECT l.id, l.name, l.description, l.file_path
    FROM locations l
    WHERE l.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND l.universe_id = ?";
    params.push(universeId);
  }

  query += " ORDER BY l.updated_at DESC LIMIT 3";

  const locations = db.prepare(query).all(...params) as {
    id: string;
    name: string;
    description: string | null;
    file_path: string | null;
  }[];

  let deepened = 0;
  for (const loc of locations) {
    const existingLore = loc.description || "";
    if (!existingLore) continue;

    const prompt = `Expand on the location "${loc.name}". Current description:\n${existingLore.slice(0, 500)}\n\nAdd 2-3 new atmospheric details, historical notes, or sensory descriptions. Do not contradict existing facts. Return only the new content.`;

    try {
      const expansion = await generateText(prompt, { userId });

      // Store as unverified lore expansion
      db.prepare(`
        INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by)
        VALUES (?, ?, 'location', ?, 'generated_unverified', 'idle_enrichment')
      `).run(crypto.randomUUID(), userId, loc.id);

      // Also store as narrative memory for context retrieval
      db.prepare(`
        INSERT INTO narrative_memories (id, user_id, universe_id, session_id, type, content, importance)
        VALUES (?, ?, ?, NULL, 'location_lore', ?, ?)
      `).run(
        crypto.randomUUID(),
        userId,
        universeId,
        `[LOCATION DEEPENING] ${loc.name}: ${expansion}`,
        JSON.stringify({ emotional: 1, local: 3, canonical: 2, recency: 4 })
      );

      deepened++;
    } catch {
      // Skip failed locations
    }
  }

  return deepened;
}

/**
 * Enrich NPC backstories with new details based on recent interactions.
 */
async function enrichNPCBackstories(userId: string, universeId: string | null): Promise<number> {
  const db = getDb();

  let query = `
    SELECT n.id, n.name, n.file_path, n.importance
    FROM npcs n
    WHERE n.user_id = ? AND n.importance IN ('high', 'critical')
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND n.universe_id = ?";
    params.push(universeId);
  }

  query += " ORDER BY n.importance DESC LIMIT 3";

  const npcs = db.prepare(query).all(...params) as {
    id: string;
    name: string;
    file_path: string | null;
    importance: string;
  }[];

  let enriched = 0;
  for (const npc of npcs) {
    const filePath = npc.file_path;
    if (!filePath) continue;

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) continue;

    const existingContent = fs.readFileSync(fullPath, "utf-8");

    const prompt = `Expand on the NPC "${npc.name}". Current lore:\n${existingContent.slice(0, 1000)}\n\nAdd 2-3 new details about their personality, habits, or hidden motivations. Do not contradict existing facts. Return only the new content as markdown.`;

    try {
      const enrichment = await generateText(prompt, { userId });
      const newContent = existingContent + `\n\n## Recent Observations\n${enrichment}`;
      fs.writeFileSync(fullPath, newContent, "utf-8");

      db.prepare(
        "INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by) VALUES (?, ?, 'npc', ?, 'generated_unverified', 'enrich_npc')"
      ).run(crypto.randomUUID(), userId, npc.id);

      enriched++;
    } catch {
      // Skip failed NPCs
    }
  }

  return enriched;
}

/**
 * Generate rumors based on recent events in the universe.
 */
async function expandRumors(userId: string, universeId: string | null): Promise<number> {
  const db = getDb();

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

  query += " ORDER BY occurred_at DESC LIMIT 5";

  const recentEvents = db.prepare(query).all(...params) as {
    id: string;
    title: string;
    event_type: string;
    outcome: string | null;
    occurred_at: string;
  }[];

  let generated = 0;
  for (const event of recentEvents) {
    // Check if rumor already exists for this event
    const existingRumor = db.prepare(
      "SELECT id FROM narrative_memories WHERE user_id = ? AND type = 'rumor' AND content LIKE ?"
    ).get(userId, `%${event.title}%`);

    if (existingRumor) continue;

    const prompt = `Based on this event: "${event.title}" (${event.event_type}, outcome: ${event.outcome || "unknown"}), generate 1-2 rumors that might spread among NPCs. Rumors should be plausible but potentially inaccurate. Return as bullet points.`;

    try {
      const rumors = await generateText(prompt, { userId });

      db.prepare(
        "INSERT INTO narrative_memories (id, user_id, universe_id, session_id, type, content, importance, related_entities) VALUES (?, ?, ?, NULL, 'rumor', ?, ?, ?)"
      ).run(
        crypto.randomUUID(),
        userId,
        universeId,
        rumors,
        JSON.stringify({ emotional: 1, local: 2, canonical: 1, recency: 4 }),
        JSON.stringify([event.id])
      );

      generated++;
    } catch {
      // Skip failed events
    }
  }

  return generated;
}

/**
 * Archive memories with low importance scores.
 */
async function archiveLowImportanceMemories(userId: string, universeId: string | null): Promise<number> {
  const candidates = getArchivalCandidates(userId);

  let archived = 0;
  const db = getDb();

  for (const candidate of candidates.slice(0, 10)) {
    if (candidate.entityType === "lore" || candidate.entityType === "event") {
      const prompt = `Summarize this narrative memory in one sentence: "${candidate.entityId}"`;

      try {
        const summary = await generateText(prompt, { userId });

        db.prepare(
          "UPDATE narrative_memories SET content = ?, importance = ? WHERE id = ?"
        ).run(
          `[ARCHIVED] ${summary}`,
          JSON.stringify({ emotional: 1, local: 1, canonical: 1, recency: 1 }),
          candidate.entityId
        );

        archived++;
      } catch {
        // Skip failed memories
      }
    }
  }

  return archived;
}
