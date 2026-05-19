/**
 * Wiki Idle Tasks
 *
 * Wiki-related idle-time processing functions called from the main
 * idle-processing tiers. Each function handles a specific wiki operation
 * during user idle periods.
 */

import { getDb } from "@/lib/db";
import { listWikiPages, writeWikiPage, WikiFrontmatter } from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { appendLog } from "@/lib/wiki/logger";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { TIME, CONTENT_LIMITS } from "@/lib/config";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the wiki root directory for a user/universe.
 */
export function getWikiRoot(userId: string, universeId?: string): string {
  const dataDir = process.env.DATA_DIR || "./data";
  return universeId
    ? `${dataDir}/${userId}/wiki/${universeId}`
    : `${dataDir}/${userId}/wiki`;
}

// ---------------------------------------------------------------------------
// Wiki Idle Task Functions
// ---------------------------------------------------------------------------

/**
 * Tier 1 (wiki): Compress old wiki summaries by updating frontmatter and
 * summarizing stale draft pages.
 */
export async function wikiCompressSummaries(userId: string, universeId?: string): Promise<{ compressed: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { compressed: 0, errors: ["Wiki root not found"] };

  const pages = listWikiPages(wikiRoot);
  const sevenDaysAgo = Date.now() - TIME.SEVEN_DAYS;
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
export async function wikiRefineRelationships(userId: string, universeId?: string): Promise<{ refined: number; errors: string[] }> {
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
export async function wikiDeepenPages(userId: string, universeId?: string): Promise<{ deepened: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { deepened: 0, errors: ["Wiki root not found"] };

  const pages = listWikiPages(wikiRoot);
  const threeDaysAgo = Date.now() - TIME.THREE_DAYS;

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
export async function wikiEnrichEntities(userId: string, universeId?: string): Promise<{ enriched: number; errors: string[] }> {
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
    const prompt = PROMPTS.wikiEnrichEntity(title, page.content.slice(0, CONTENT_LIMITS.SUMMARY_CHUNK));

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
export async function wikiGenerateRumors(userId: string, universeId?: string): Promise<{ rumorsGenerated: number; errors: string[] }> {
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
export async function wikiArchive(userId: string, universeId?: string): Promise<{ archived: number; errors: string[] }> {
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) return { archived: 0, errors: ["Wiki root not found"] };

  const pages = listWikiPages(wikiRoot);
  const thirtyDaysAgo = Date.now() - TIME.THIRTY_DAYS;

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
      const prompt = PROMPTS.wikiSummarizePageOneSentence(page.content.slice(0, CONTENT_LIMITS.PREVIEW));
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
export async function wikiDecayRelationships(userId: string, universeId?: string): Promise<{ decayed: number; errors: string[] }> {
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
