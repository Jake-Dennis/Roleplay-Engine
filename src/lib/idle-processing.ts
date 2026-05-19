/**
 * Idle-Time Processing Tiers
 * 
 * Coordinates background job processing during user idle periods.
 * Since there are no persistent background workers, processing is triggered
 * by user requests (via middleware) when enough idle time has passed.
 * 
 * Processing tiers:
 * - 5 minutes: High-priority job processing (response generation)
 * - 10 minutes: Relationship analysis, embedding generation
 * - 15 minutes: Lore expansion
 * - 30 minutes: Relationship decay, memory compression, summarization
 *
 * The system tracks the last processing time per user and triggers
 * appropriate tier processing when a new request arrives.
 */

import { getDb } from "@/lib/db";
import {
  processUserJobs,
  processJobsByType,
  queueJob,
  type JobType,
} from "@/lib/job-processor";
import { getSessionsNeedingSummaries } from "@/lib/summarization";
import { getEntitiesNeedingEmbeddings, processEmbeddings } from "@/lib/embeddings";
import { getSessionsNeedingRelationshipAnalysis, processRelationshipAnalysis } from "@/lib/relationship-analysis";
import { needsDecayProcessing } from "@/lib/relationship-decay";
import { needsMemoryCompression } from "@/lib/memory-compression";

// Wiki I/O modules
import { listWikiPages, writeWikiPage, readWikiPage, WikiFrontmatter } from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { appendLog } from "@/lib/wiki/logger";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import path from "path";
import fs from "fs";

// Processing tier thresholds (in milliseconds)
const TIER_THRESHOLDS = {
  tier1_5min: 5 * 60 * 1000,
  tier2_10min: 10 * 60 * 1000,
  tier3_15min: 15 * 60 * 1000,
  tier4_30min: 30 * 60 * 1000,
};

export interface IdleProcessingResult {
  tiersProcessed: string[];
  jobsProcessed: number;
  summariesCreated: number;
  embeddingsCreated: number;
  relationshipsAnalyzed: number;
  loreExpanded: number;
  relationshipsDecayed: number;
  memoriesCompressed: number;
  contradictionsFound: number;
  // Wiki-specific metrics
  wikiPagesCreated: number;
  wikiPagesUpdated: number;
  wikiPagesArchived: number;
  wikiRumorsGenerated: number;
  wikiEntitiesEnriched: number;
  wikiRelationshipsDecayed: number;
}

// Track last processing time in memory (resets on server restart)
const lastProcessingTime = new Map<string, number>();

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
 * Tier 1 (wiki): Compress old wiki summaries by updating frontmatter and
 * summarizing stale draft pages.
 */
async function wikiCompressSummaries(userId: string, universeId?: string): Promise<{ compressed: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { compressed: 0, errors: ["Wiki root not found"] };

  const pages = listWikiPages(wikiRoot);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let compressed = 0;
  const errors: string[] = [];

  for (const page of pages.slice(0, 20)) {
    const created = page.frontmatter.created ? new Date(page.frontmatter.created).getTime() : 0;
    const updated = page.frontmatter.updated ? new Date(page.frontmatter.updated).getTime() : 0;
    const lastActivity = Math.max(created, updated);

    // Only process pages older than 7 days that are still draft
    if (lastActivity > 0 && lastActivity < sevenDaysAgo && page.frontmatter.status === "draft") {
      try {
        // Summarize the page content and update frontmatter
        const prompt = PROMPTS.wikiSummarizePage(page.content.slice(0, 500));
        const summary = await generateText(prompt, { temperature: 0.2, num_ctx: 2048, userId });

        const updatedFrontmatter: WikiFrontmatter = {
          title: page.frontmatter.title as string || path.basename(page.path, ".md"),
          type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
          status: "reviewed", // Promote from draft after compression
          universe: page.frontmatter.universe as string,
          tags: [...(page.frontmatter.tags as string[] || []), "compressed"],
          created: page.frontmatter.created,
          updated: new Date().toISOString(),
        };

        const newContent = `> **Compressed Summary:** ${summary}\n\n---\n\n${page.content}`;
        writeWikiPage(page.path, newContent, updatedFrontmatter);
        compressed++;
      } catch (e) {
        errors.push(`Failed to compress ${page.path}: ${(e as Error).message}`);
      }
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  try { appendLog(wikiRoot, "update", "batch", `Compressed: ${compressed}`); } catch { /* non-fatal */ }

  return { compressed, errors };
}

/**
 * Tier 1 (wiki): Refine relationship wiki pages with recent interaction summaries.
 */
async function wikiRefineRelationships(userId: string, universeId?: string): Promise<{ refined: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { refined: 0, errors: ["Wiki root not found"] };

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
  const errors: string[] = [];

  for (const rel of relationships) {
    const emotions = rel.emotional_state ? JSON.parse(rel.emotional_state) : {};
    const history = rel.shared_history ? JSON.parse(rel.shared_history) : [];

    const emotionSummary = Object.entries(emotions)
      .filter(([, v]) => (v as number) > 0.3)
      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}`)
      .join(", ");

    // Look for existing relationship wiki page
    const pages = listWikiPages(wikiRoot);
    const relPage = pages.find(
      (p) => p.frontmatter.title?.toLowerCase().includes(rel.source_entity.toLowerCase()) &&
             p.frontmatter.title?.toLowerCase().includes(rel.target_entity.toLowerCase())
    );

    const prompt = PROMPTS.wikiSummarizeRelationship(
      rel.source_entity,
      rel.target_entity,
      emotionSummary || "neutral",
      history.slice(-3).map((h: { summary?: string } | string) => typeof h === 'string' ? h : (h.summary || h)).join("; ")
    );

    try {
      const summary = await generateText(prompt, { userId });

      if (relPage) {
        // Update existing relationship page
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
        // Create new relationship page
        const filename = `relationship_${rel.source_entity.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}_${rel.target_entity.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}.md`;
        const pagePath = path.join(wikiRoot, "synthesis", filename);
        const frontmatter: WikiFrontmatter = {
          title: `Relationship: ${rel.source_entity} & ${rel.target_entity}`,
          type: "synthesis",
          status: "draft",
          universe: universeId,
          tags: ["relationship", `entity:${rel.source_entity}`, `entity:${rel.target_entity}`],
          created: new Date().toISOString(),
        };
        writeWikiPage(pagePath, summary, frontmatter);
      }
      refined++;
    } catch (e) {
      errors.push(`Failed to refine relationship ${rel.id}: ${(e as Error).message}`);
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return { refined, errors };
}

/**
 * Tier 2 (wiki): Deepen existing wiki pages with additional details.
 */
async function wikiDeepenPages(userId: string, universeId?: string): Promise<{ deepened: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { deepened: 0, errors: ["Wiki root not found"] };

  const pages = listWikiPages(wikiRoot);
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  const pagesToDeepen = pages
    .filter((p) => {
      const matchUniverse = !universeId || p.frontmatter.universe === universeId;
      const isOld = !p.frontmatter.updated || new Date(p.frontmatter.updated).getTime() < threeDaysAgo;
      return matchUniverse && isOld && p.content.length > 50;
    })
    .slice(0, 5);

  let deepened = 0;
  const errors: string[] = [];

  for (const page of pagesToDeepen) {
    const title = page.frontmatter.title || path.basename(page.path, ".md");
    const prompt = PROMPTS.wikiDeepenPage(title, String(page.frontmatter.type), page.content.slice(0, 800));

    try {
      const deepening = await generateText(prompt, { userId });
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
    } catch (e) {
      errors.push(`Failed to deepen ${page.path}: ${(e as Error).message}`);
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  try { appendLog(wikiRoot, "update", "batch", `Deepened: ${deepened}`); } catch { /* non-fatal */ }

  return { deepened, errors };
}

/**
 * Tier 2 (wiki): Enrich high-importance wiki entities with LLM-generated details.
 */
async function wikiEnrichEntities(userId: string, universeId?: string): Promise<{ enriched: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { enriched: 0, errors: ["Wiki root not found"] };

  const pages = listWikiPages(wikiRoot);
  const entitiesToEnrich = pages
    .filter((p) => {
      const matchUniverse = !universeId || p.frontmatter.universe === universeId;
      const isEntity = p.frontmatter.type === "entity";
      const isDraftOrReviewed = p.frontmatter.status === "draft" || p.frontmatter.status === "reviewed";
      return matchUniverse && isEntity && isDraftOrReviewed;
    })
    .slice(0, 3);

  let enriched = 0;
  const errors: string[] = [];

  for (const page of entitiesToEnrich) {
    const title = page.frontmatter.title || path.basename(page.path, ".md");
    const prompt = PROMPTS.wikiEnrichEntity(title, page.content.slice(0, 1000));

    try {
      const enrichment = await generateText(prompt, { userId });
      const newContent = page.content.trimEnd() + `\n\n## Additional Details\n${enrichment}`;

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
    } catch (e) {
      errors.push(`Failed to enrich ${page.path}: ${(e as Error).message}`);
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return { enriched, errors };
}

/**
 * Tier 3 (wiki): Generate rumor pages from recent events.
 */
async function wikiGenerateRumors(userId: string, universeId?: string): Promise<{ rumorsGenerated: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { rumorsGenerated: 0, errors: ["Wiki root not found"] };

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
    return { rumorsGenerated: 0, errors: [] };
  }

  let rumorsGenerated = 0;
  const errors: string[] = [];
  const existingPages = listWikiPages(wikiRoot);

  for (const event of recentEvents) {
    // Check if rumor already exists
    const existingRumor = existingPages.find(
      (p) => p.frontmatter.tags?.includes(`event:${event.id}`)
    );
    if (existingRumor) continue;

    const prompt = PROMPTS.wikiGenerateRumors(event.title, event.event_type, event.outcome || "unknown");

    try {
      const rumors = await generateText(prompt, { userId });
      const filename = `rumor_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
      const pagePath = path.join(wikiRoot, "concepts", filename);

      const frontmatter: WikiFrontmatter = {
        title: `Rumor: ${event.title}`,
        type: "concept",
        status: "draft",
        universe: universeId,
        tags: ["rumor", `event:${event.id}`, `type:${event.event_type}`],
        created: new Date().toISOString(),
      };

      writeWikiPage(pagePath, rumors, frontmatter);
      rumorsGenerated++;
    } catch (e) {
      errors.push(`Failed to generate rumor for ${event.title}: ${(e as Error).message}`);
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return { rumorsGenerated, errors };
}

/**
 * Tier 3 (wiki): Archive low-importance wiki pages by marking them as archived.
 */
async function wikiArchive(userId: string, universeId?: string): Promise<{ archived: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { archived: 0, errors: ["Wiki root not found"] };

  const pages = listWikiPages(wikiRoot);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Find old draft pages with no recent updates
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
  const errors: string[] = [];

  for (const page of archiveCandidates) {
    try {
      // Summarize before archiving
      const prompt = PROMPTS.wikiSummarizePageOneSentence(page.content.slice(0, 300));
      const summary = await generateText(prompt, { temperature: 0.2, num_ctx: 2048, userId });

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string,
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        status: "rejected", // Use rejected as archived status
        universe: page.frontmatter.universe as string,
        tags: [...(page.frontmatter.tags as string[] || []), "archived"],
        created: page.frontmatter.created,
        updated: new Date().toISOString(),
      };

      const newContent = `> **Archived:** ${summary}\n\n---\n\n${page.content}`;
      writeWikiPage(page.path, newContent, updatedFrontmatter);
      archived++;
    } catch (e) {
      errors.push(`Failed to archive ${page.path}: ${(e as Error).message}`);
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  try { appendLog(wikiRoot, "update", "batch", `Archived: ${archived}`); } catch { /* non-fatal */ }

  return { archived, errors };
}

/**
 * Tier 4 (wiki): Apply relationship decay logic to relationship wiki pages.
 */
async function wikiDecayRelationships(userId: string, universeId?: string): Promise<{ decayed: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { decayed: 0, errors: ["Wiki root not found"] };

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
  const errors: string[] = [];
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
      } catch { /* skip DB update failure */ }

      // Update wiki page if it exists
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
        } catch (e) {
          errors.push(`Failed to update wiki for relationship ${rel.id}: ${(e as Error).message}`);
        }
      }

      decayed++;
    }
  }

  try { generateIndex(wikiRoot); } catch { /* non-fatal */ }
  return { decayed, errors };
}

// ---------------------------------------------------------------------------
// Main Processing
// ---------------------------------------------------------------------------

/**
 * Process idle-time jobs for a user when they make a request.
 * Called from middleware on authenticated requests.
 */
export async function processIdleTime(userId: string, universeId: string | null = null): Promise<IdleProcessingResult> {
  const now = Date.now();
  const lastTime = lastProcessingTime.get(userId) || 0;
  const idleTime = now - lastTime;

  // Don't process if less than 5 minutes have passed
  if (idleTime < TIER_THRESHOLDS.tier1_5min) {
    return {
      tiersProcessed: [],
      jobsProcessed: 0,
      summariesCreated: 0,
      embeddingsCreated: 0,
      relationshipsAnalyzed: 0,
      loreExpanded: 0,
      relationshipsDecayed: 0,
      memoriesCompressed: 0,
      contradictionsFound: 0,
      wikiPagesCreated: 0,
      wikiPagesUpdated: 0,
      wikiPagesArchived: 0,
      wikiRumorsGenerated: 0,
      wikiEntitiesEnriched: 0,
      wikiRelationshipsDecayed: 0,
    };
  }

  const result: IdleProcessingResult = {
    tiersProcessed: [],
    jobsProcessed: 0,
    summariesCreated: 0,
    embeddingsCreated: 0,
    relationshipsAnalyzed: 0,
    loreExpanded: 0,
    relationshipsDecayed: 0,
    memoriesCompressed: 0,
    contradictionsFound: 0,
    wikiPagesCreated: 0,
    wikiPagesUpdated: 0,
    wikiPagesArchived: 0,
    wikiRumorsGenerated: 0,
    wikiEntitiesEnriched: 0,
    wikiRelationshipsDecayed: 0,
  };

  // Update last processing time
  lastProcessingTime.set(userId, now);

  const uid = universeId || undefined;

  // Tier 1 (5+ minutes): Process high-priority jobs
  if (idleTime >= TIER_THRESHOLDS.tier1_5min) {
    result.tiersProcessed.push("5min");

    // Wiki: compress summaries + refine relationships
    try {
      const compressResult = await wikiCompressSummaries(userId, uid);
      result.wikiPagesUpdated += compressResult.compressed;
      result.memoriesCompressed += compressResult.compressed;
    } catch { /* non-fatal */ }

    try {
      const refineResult = await wikiRefineRelationships(userId, uid);
      result.wikiPagesCreated += refineResult.refined;
      result.relationshipsAnalyzed += refineResult.refined;
    } catch { /* non-fatal */ }

    const jobResults = await processJobsByType(userId, "generate_response", 5);
    result.jobsProcessed += jobResults.filter((r) => r.success).length;
  }

  // Tier 2 (10+ minutes): Relationship analysis + embeddings
  if (idleTime >= TIER_THRESHOLDS.tier2_10min) {
    result.tiersProcessed.push("10min");

    // Wiki: deepen pages + enrich entities
    try {
      const deepenResult = await wikiDeepenPages(userId, uid);
      result.wikiPagesUpdated += deepenResult.deepened;
      result.loreExpanded += deepenResult.deepened;
    } catch { /* non-fatal */ }

    try {
      const enrichResult = await wikiEnrichEntities(userId, uid);
      result.wikiEntitiesEnriched += enrichResult.enriched;
      result.wikiPagesUpdated += enrichResult.enriched;
    } catch { /* non-fatal */ }

    const embedResults = await processJobsByType(userId, "generate_embeddings", 10);
    result.jobsProcessed += embedResults.filter((r) => r.success).length;
    result.embeddingsCreated += embedResults.filter((r) => r.success).length;

    const sessionsNeedingAnalysis = getSessionsNeedingRelationshipAnalysis(userId);
    for (const sessionId of sessionsNeedingAnalysis.slice(0, 3)) {
      try {
        const analysisResult = await processRelationshipAnalysis(userId, sessionId);
        result.relationshipsAnalyzed += analysisResult.analyzedCount;
      } catch {
        // Skip failed sessions
      }
    }
  }

  // Tier 3 (15+ minutes): Lore expansion + semantic contradiction scan
  if (idleTime >= TIER_THRESHOLDS.tier3_15min) {
    result.tiersProcessed.push("15min");

    // Wiki: generate rumors + archive low-importance pages
    try {
      const rumorResult = await wikiGenerateRumors(userId, uid);
      result.wikiRumorsGenerated += rumorResult.rumorsGenerated;
      result.wikiPagesCreated += rumorResult.rumorsGenerated;
    } catch { /* non-fatal */ }

    try {
      const archiveResult = await wikiArchive(userId, uid);
      result.wikiPagesArchived += archiveResult.archived;
      result.memoriesCompressed += archiveResult.archived;
    } catch { /* non-fatal */ }
  }

  // Tier 4 (30+ minutes): Decay, compression, summarization
  if (idleTime >= TIER_THRESHOLDS.tier4_30min) {
    result.tiersProcessed.push("30min");

    // Wiki: decay relationships via wiki pages
    try {
      const decayResult = await wikiDecayRelationships(userId, uid);
      result.wikiRelationshipsDecayed += decayResult.decayed;
      result.relationshipsDecayed += decayResult.decayed;
    } catch { /* non-fatal */ }

    // Memory compression (universe-scoped)
    if (needsMemoryCompression(userId)) {
      try {
        const db = getDb();
        let query = `
          SELECT id, content, type, importance, created_at
          FROM narrative_memories
          WHERE user_id = ? AND created_at < datetime('now', '-7 days')
        `;
        const params: (string | number)[] = [userId];
        if (universeId) {
          query += " AND universe_id = ?";
          params.push(universeId);
        }
        query += " ORDER BY created_at ASC LIMIT 50";
        const memories = db.prepare(query).all(...params) as {
          id: string; content: string; type: string; importance: string | null; created_at: string;
        }[];

        for (const memory of memories) {
          const age = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (age >= 90) {
            db.prepare("UPDATE narrative_memories SET content = ?, importance = 'archived' WHERE id = ?").run(`[ARCHIVED] ${memory.content.slice(0, 100)}`, memory.id);
            result.memoriesCompressed++;
          } else if (age >= 30) {
            db.prepare("UPDATE narrative_memories SET content = ?, importance = 'low' WHERE id = ?").run(memory.content.slice(0, 200), memory.id);
            result.memoriesCompressed++;
          } else if (age >= 7) {
            db.prepare("UPDATE narrative_memories SET content = ? WHERE id = ?").run(memory.content.slice(0, 300), memory.id);
            result.memoriesCompressed++;
          }
        }
      } catch {
        // Skip if compression fails
      }
    }

    // Summarization
    const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
    for (const sessionId of sessionsNeedingSummaries.slice(0, 3)) {
      try {
        const { queueJob } = await import("./job-processor");
        queueJob(userId, "summarize_messages", { sessionId }, "low");
      } catch {
        // Skip if queueing fails
      }
    }

    // Process remaining queued jobs
    const remainingResults = await processUserJobs(userId, 10);
    result.jobsProcessed += remainingResults.filter((r) => r.success).length;
  }

  return result;
}

/**
 * Get the time since last idle processing for a user
 */
export function getIdleTime(userId: string): number {
  const lastTime = lastProcessingTime.get(userId) || 0;
  return Date.now() - lastTime;
}

/**
 * Check if idle processing should be triggered
 */
export function shouldProcessIdleTime(userId: string): boolean {
  const idleTime = getIdleTime(userId);
  return idleTime >= TIER_THRESHOLDS.tier1_5min;
}

/**
 * Reset the idle timer for a user (called on explicit job processing)
 */
export function resetIdleTimer(userId: string): void {
  lastProcessingTime.set(userId, Date.now());
}

/**
 * Queue idle-time jobs for a user
 */
export function queueIdleJobs(userId: string, universeId: string | null = null): number {
  const db = getDb();
  let queued = 0;

  // If no universe specified, get the user's most recent active universe
  const effectiveUniverse = universeId || (() => {
    const row = db.prepare(`
      SELECT universe_id FROM sessions
      WHERE owner_id = ? AND status = 'active' AND universe_id IS NOT NULL
      ORDER BY updated_at DESC LIMIT 1
    `).get(userId) as { universe_id: string } | undefined;
    return row?.universe_id || null;
  })();

  // Wiki job queueing
  // Queue wiki ingest for lore entries
  queueJob(userId, "wiki_ingest", { userId, universeId: effectiveUniverse || undefined }, "low", effectiveUniverse || undefined);
  queued++;

  // Queue wiki entity enrichment
  queueJob(userId, "wiki_enrich_entity", { userId, universeId: effectiveUniverse || undefined }, "low", effectiveUniverse || undefined);
  queued++;

  // Queue wiki rumor generation
  queueJob(userId, "wiki_generate_rumors", { userId, universeId: effectiveUniverse || undefined }, "low", effectiveUniverse || undefined);
  queued++;

  // Queue wiki page deepening
  queueJob(userId, "wiki_deepen_page", { userId, universeId: effectiveUniverse || undefined }, "low", effectiveUniverse || undefined);
  queued++;

  // Queue wiki relationship decay
  if (needsDecayProcessing(userId)) {
    queueJob(userId, "decay_relationships", { userId, universeId: effectiveUniverse || undefined }, "low", effectiveUniverse || undefined);
    queued++;
  }

  // Queue summarization (not wiki-specific)
  const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
  for (const sessionId of sessionsNeedingSummaries.slice(0, 5)) {
    queueJob(userId, "summarize_messages", { sessionId }, "low");
    queued++;
  }

  return queued;
}

/**
 * Process idle tier jobs triggered by client-side heartbeat.
 * Called when the client detects user inactivity and reports a tier change.
 *
 * Tiers:
 * 1 (5 min):  compress_memories, refine_relationship_summary
 * 2 (10 min): wiki_deepen_page, wiki_enrich_entity, generate_embeddings
 * 3 (15 min): wiki_generate_rumors, archival_processing
 * 4 (30 min): decay_relationships, summarize_messages
 */
export async function processIdleTier(
  userId: string,
  tier: number,
  _currentPage: string,
  universeId: string | null = null
): Promise<{ jobsQueued: number; tier: number }> {
  let queued = 0;
  const uid = universeId || undefined;

  try {
    switch (tier) {
      case 1: // 5 min idle
        queueJob(userId, "compress_memories", { userId, universeId: uid }, "idle", uid);
        queued++;
        queueJob(userId, "refine_relationship_summary", { userId, universeId: uid }, "idle", uid);
        queued++;
        break;

      case 2: // 10 min idle
        queueJob(userId, "wiki_deepen_page", { userId, universeId: uid }, "idle", uid);
        queued++;
        queueJob(userId, "wiki_enrich_entity", { userId, universeId: uid }, "idle", uid);
        queued++;
        // Embeddings (always queued)
        try {
          const entitiesNeedingEmbeddings = getEntitiesNeedingEmbeddings(userId);
          for (const entity of entitiesNeedingEmbeddings.slice(0, 5)) {
            queueJob(userId, "generate_embeddings", {
              entityType: entity.entityType,
              entityId: entity.entityId,
              userId,
            }, "idle");
            queued++;
          }
        } catch { /* skip if embedding queue fails */ }
        break;

      case 3: // 15 min idle
        queueJob(userId, "wiki_generate_rumors", { userId, universeId: uid }, "idle", uid);
        queued++;
        queueJob(userId, "archival_processing", { userId, universeId: uid }, "idle", uid);
        queued++;
        break;

      case 4: // 30 min idle
        if (needsDecayProcessing(userId)) {
          queueJob(userId, "decay_relationships", { userId, universeId: uid }, "idle", uid);
          queued++;
        }
        // Summarization (always queued)
        try {
          const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
          for (const sessionId of sessionsNeedingSummaries.slice(0, 3)) {
            queueJob(userId, "summarize_messages", { sessionId }, "idle");
            queued++;
          }
        } catch { /* skip if summarization fails */ }
        break;
    }
  } catch {
    // Log but don't throw — heartbeat should always succeed
  }

  return { jobsQueued: queued, tier };
}
