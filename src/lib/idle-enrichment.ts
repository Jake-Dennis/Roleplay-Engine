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
 * | > 5 min | wikiCompressOldSummaries(), wikiRefineRelationshipSummaries() |
 * | > 10 min | wikiDeepenActiveLocations(), wikiEnrichNPCBackstories() |
 * | > 15 min | wikiExpandRumors(), wikiArchiveLowImportanceMemories() |
 * | > 30 min | wikiApplyRelationshipDecay() |
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

  // Get recent events from DB (wrapped in try/catch — events table will be dropped in Phase 5)
  let recentEvents: { id: string; title: string; event_type: string; outcome: string | null; occurred_at: string }[] = [];
  try {
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

    recentEvents = db.prepare(query).all(...params) as {
      id: string; title: string; event_type: string; outcome: string | null; occurred_at: string;
    }[];
  } catch {
    // events table may not exist — return 0 processed
    return 0;
  }

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

  // Tier 1: > 5 minutes
  if (idleMinutes >= 5) {
    result.tier = 1;

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

  // Tier 2: > 10 minutes
  if (idleMinutes >= 10) {
    result.tier = 2;

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

  // Tier 3: > 15 minutes
  if (idleMinutes >= 15) {
    result.tier = 3;

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

  // Tier 4: > 30 minutes
  if (idleMinutes >= 30) {
    result.tier = 4;

    const wikiDecayed = await wikiApplyRelationshipDecay(userId, universeId);
    if (wikiDecayed > 0) {
      result.actionsCompleted.push("wikiApplyRelationshipDecay");
      result.itemsProcessed += wikiDecayed;
      result.wikiPagesUpdated += wikiDecayed;
    }
  }

  return result;
}
