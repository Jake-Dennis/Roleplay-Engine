/**
 * Context Retrieval Pipeline
 *
 * WHAT: Assembles the context window for LLM generation. Retrieves scene state,
 * narrative memories, lore, relationships, recent messages, and active threads.
 * Entry point: getRetrievedContext(userId, sessionId, universeId, messageContent, options?)
 *
 * Pipeline order:
 * 1. Scene context (location, NPCs, tone)
 * 2. Lore retrieval (nearby wiki entries, ranked by relevance)
 * 3. Memory retrieval (narrative memories, importance-ranked)
 * 4. Relationship context (current emotional state)
 * 5. Recent messages (truncated to budget)
 * 6. Active narrative threads
 * 7. Intent analysis (keyword → semantic)
 *
 * Budget enforcement: applyContextBudget() trims each section to its token allocation
 * defined in PROMPT_BUDGET (from config.ts). Total context: 6000 tokens.
 */

import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { classifyIntent, type Intent } from "@/lib/intent-analyzer";
import { readWikiPage, listWikiPages } from "@/lib/wiki/file-io";
import { parseWikiIndex, scoreWikiEntry, resolveWikiPagePath } from "@/lib/wiki/index-utils";
import { safeParseWarn } from "@/lib/safe-json";
import { getServerConfig } from "@/lib/server-config";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { generateEmbedding } from "@/lib/ollama";
import { calculateImportance, type ImportanceScores } from "@/lib/importance";

// H5: Re-export prompt assembly function from canonical source (prompt-builder.ts)
export { assemblePromptWithBudget } from "@/lib/prompt-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneContext {
  location: string | null;
  goal: string | null;
  tone: string | null;
  currentIntent: string | null;
  activeNpcs: string[];
  activeThreads: string[];
  /** New narrative state fields (Task 31) */
  sceneType?: string | null;
  sceneTension?: number | null;
  conflictType?: string | null;
  stakes?: string | null;
}

export interface LoreContext {
  entries: { id: number; name: string; description: string; type: string }[];
}

export interface RelationshipContext {
  relationships: {
    source: string;
    target: string;
    state: string | null;           // current emotional_state string (e.g., "like")
    emotionalState?: Record<string, number>;  // parsed emotion vector from DB JSON
    stage?: string | null;          // relationship_stage
    sharedHistory?: { type: string; summary: string; at: string }[];  // parsed from JSON (last 2)
    updatedAt?: string | null;      // for decay calculation
  }[];
}

export interface MessageContext {
  messages: { id: string; senderId: string | null; content: string; timestamp: string; senderName?: string | null; personaName?: string | null }[];
}

export interface RetrievedContext {
  scene: SceneContext;
  lore: LoreContext;
  relationships: RelationshipContext;
  recentMessages: MessageContext;
  canonContext: string | null;
  intent: Intent;

  /** Narrative memories retrieved for the current context */
  memories?: {
    entries: { content: string; type: string; importance: number; created_at: string }[];
  };

  /** Active narrative threads in the current session/universe */
  narrativeThreads?: {
    title: string; status: string; description?: string; escalation_level?: string;
  }[];

  /** Message summaries for when raw messages are truncated */
  messageSummaries?: {
    summary: string; type: string;
  }[];

  /** Relevant past messages from semantic vector search (RAG) */
  relevantMessages?: {
    messages: { content: string; senderId: string | null }[];
  };

  /** Active entity names appearing in the narrative (Task 25) */
  activeEntities?: string[];

  /** Relationship evolution history (Task 28) */
  relationshipEvolution?: Array<{
    relationshipId: string;
    source: string;
    target: string;
    emotionalState: string | null;
    relationshipStage: string | null;
    triggerEvent: string | null;
    recordedAt: string;
  }>;

  /** Narrative anchors — significant relationship moments that resist decay (Task 27) */
  relationshipAnchors?: Array<{
    description: string;
    anchor_type: string;
    emotional_impact?: string;
  }>;

  /** Decision points — narrative choices presented and selected (Task 34) */
  decisionPoints?: Array<{
    prompt: string;
    choicesMade: string[];
    context: string | null;
  }>;

  /** Session-level narrative state (Task 35) */
  narrativeState?: {
    tension: number | null;
    pacing: number | null;
    narrativePhase: string | null;
    activeGoals: string | null;
    activeConflicts: string | null;
  };
}

/** Token cost and inclusion info for a single item in a budget section */
export interface BudgetItemInfo {
  index: number;
  label: string;
  tokens: number;
  included: boolean;
  importance?: number;
}

/** Budget tracking for one retrieval section (messages, lore, etc.) */
export interface SectionBudget {
  label: string;
  percentage: number;
  budgetTokens: number;
  usedTokens: number;
  originalCount: number;
  finalCount: number;
  isTruncated: boolean;
  items: BudgetItemInfo[];
}

/** Overall token budget allocation breakdown */
export interface BudgetBreakdown {
  maxTokens: number;
  overhead: number;
  availableTokens: number;
  usedTokens: number;
  sections: Record<string, SectionBudget>;
}

/** Response shape for the retrieval inspector endpoint */
export interface RetrievalInspectorResponse {
  context: RetrievedContext;
  budget: BudgetBreakdown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a value that may be a JSON array string or a comma-separated string.
 * Returns [] for null/empty, tries JSON.parse for `[`-prefixed values,
 * falls back to comma-split for backwards compatibility.
 */
function parseJsonOrSplit(val: string | null): string[] {
  if (!val) return [];
  if (val.startsWith("[")) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fall through to comma-split
    }
  }
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Compute cosine similarity between two vectors for hybrid scoring.
 * Returns a value in [0, 1] where 1 = identical, 0 = orthogonal or opposite.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (!isFinite(ai) || !isFinite(bi)) return 0;
    dotProduct += ai * bi;
    magnitudeA += ai * ai;
    magnitudeB += bi * bi;
  }

  const magProduct = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (magProduct === 0) return 0;

  const cos = dotProduct / magProduct;
  return Math.max(0, Math.min(1, cos));
}

// ---------------------------------------------------------------------------
// Retrieval functions
// ---------------------------------------------------------------------------

/**
 * Fetch the current scene state for a session
 */
export function getSceneContext(sessionId: string): SceneContext {
  const db = getDb();
  const result = db.prepare(
    `SELECT active_location_id, current_goal, emotional_tone, current_intent, active_npcs, active_threads,
            scene_type, scene_tension, conflict_type, stakes
     FROM scene_states
     WHERE session_id = ?
     ORDER BY updated_at DESC LIMIT 1`
  ).get(sessionId) as {
    active_location_id: string | null;
    current_goal: string | null;
    emotional_tone: string | null;
    current_intent: string | null;
    active_npcs: string | null;
    active_threads: string | null;
    scene_type: string | null;
    scene_tension: number | null;
    conflict_type: string | null;
    stakes: string | null;
  } | undefined;

  if (!result) {
    return { location: null, goal: null, tone: null, currentIntent: null, activeNpcs: [], activeThreads: [] };
  }

  return {
    location: result.active_location_id,
    goal: result.current_goal,
    tone: result.emotional_tone,
    currentIntent: result.current_intent,
    activeNpcs: parseJsonOrSplit(result.active_npcs),
    activeThreads: parseJsonOrSplit(result.active_threads),
    sceneType: result.scene_type ?? null,
    sceneTension: result.scene_tension ?? null,
    conflictType: result.conflict_type ?? null,
    stakes: result.stakes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Memory retrieval
// ---------------------------------------------------------------------------

/**
 * Fetch narrative memories with importance-based ranking.
 * 
 * Parses importance JSON, calculates composite scores via calculateImportance(),
 * filters archived entries, and sorts by composite score descending.
 * Falls back to created_at ordering when importance data is unavailable.
 */
export function getMemoryContext(
  userId: string,
  sessionId?: string,
  universeId?: string,
  limit: number = 10
): RetrievedContext['memories'] {
  const db = getDb();
  let query = `SELECT content, type, importance, created_at FROM narrative_memories WHERE user_id = ?`;
  const params: (string | number)[] = [userId];
  
  if (sessionId) { query += ` AND session_id = ?`; params.push(sessionId); }
  if (universeId) { query += ` AND universe_id = ?`; params.push(universeId); }
  
  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  
  const rows = db.prepare(query).all(...params) as { content: string; type: string; importance: string | null; created_at: string }[];
  
  if (rows.length === 0) return undefined;
  
  // Parse importance JSON and rank by composite score
  const parsed = rows
    .map(r => {
      let scores: ImportanceScores | null = null;
      if (typeof r.importance === 'string') {
        try { scores = JSON.parse(r.importance); } catch { /* ignore */ }
      }
      return { ...r, importanceScores: scores };
    })
    .filter(r => r.importanceScores !== null);
  
  if (parsed.length > 0) {
    // Calculate composite scores and filter archived
    const withComposite = parsed.map(r => ({
      ...r,
      result: calculateImportance(r.importanceScores!)
    }));
    
    const nonArchived = withComposite.filter(r => r.result.tier !== 'archived');
    // Sort: high first, then normal, then low
    nonArchived.sort((a, b) => b.result.composite - a.result.composite);
    
    return {
      entries: nonArchived.map(r => ({
        content: r.content,
        type: r.type,
        importance: r.result.composite,
        created_at: r.created_at
      }))
    };
  }
  
  // Fallback: return as-is sorted by created_at
  return {
    entries: rows.map(r => ({
      content: r.content,
      type: r.type,
      importance: Number(r.importance ?? 0) || 0,
      created_at: r.created_at
    }))
  };
}

/**
 * Fetch recent message summaries for a session.
 * Returns the most recent non-archived summaries ordered by creation time.
 */
export function getMessageSummaries(
  sessionId: string,
  count: number = 5
): RetrievedContext['messageSummaries'] {
  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT ms.summary, ms.summary_type as type
       FROM message_summaries ms
       JOIN messages m ON m.id = ms.message_id
       WHERE m.session_id = ? AND m.is_deleted = 0
         AND ms.summary_type != 'archived'
       ORDER BY ms.created_at DESC LIMIT ?`
    ).all(sessionId, count) as { summary: string; type: string }[];
    
    if (rows.length === 0) return undefined;
    
    return rows.map(r => ({
      summary: r.summary,
      type: r.type
    }));
  } catch {
    return undefined;
  }
}

/**
 * Fetch active narrative threads for a session/universe.
 * Returns threads in active or dormant status, sorted by escalation level then creation time.
 */
export function getActiveThreads(
  sessionId: string,
  universeId?: string
): RetrievedContext['narrativeThreads'] {
  const db = getDb();
  try {
    let query = `SELECT title, status, description, escalation_level FROM narrative_threads
                 WHERE session_id = ? AND status IN ('active', 'dormant')`;
    const params: (string | number)[] = [sessionId];
    if (universeId) { query += ` AND universe_id = ?`; params.push(universeId); }
    query += ` ORDER BY escalation_level DESC, created_at DESC`;

    const rows = db.prepare(query).all(...params) as { title: string; status: string; description: string | null; escalation_level: string | null }[];

    if (rows.length === 0) return undefined;

    return rows.map(r => ({
      title: r.title,
      status: r.status,
      description: r.description || undefined,
      escalation_level: r.escalation_level ?? undefined
    }));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Wiki-first retrieval (main entry point)
// ---------------------------------------------------------------------------

/**
 * Hash a file path to a numeric ID for LoreContext compatibility.
 */
function hashPathToId(filePath: string): number {
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    const char = filePath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Load all wiki entries for a universe when no query is provided.
 * Returns entries sorted by status priority (locked > reviewed > draft).
 */
function loadAllWikiEntries(wikiRoot: string, universeId: string): LoreContext {
  try {
    const allPages = listWikiPages(wikiRoot);
    const filtered = allPages.filter(
      (p) => !p.frontmatter.universe || p.frontmatter.universe === universeId
    );

    const statusPriority: Record<string, number> = { locked: 0, reviewed: 1, draft: 2, rejected: 3, dormant: 4 };
    filtered.sort(
      (a, b) =>
        (statusPriority[a.frontmatter.status ?? "draft"] ?? 2) -
        (statusPriority[b.frontmatter.status ?? "draft"] ?? 2)
    );

    const entries = filtered.slice(0, 20).map((page) => ({
      id: hashPathToId(page.path),
      name: page.frontmatter.title || path.basename(page.path, ".md"),
      description: page.content.substring(0, 500),
      type: (page.frontmatter.type || (page.frontmatter.section as string) || "entity") as string,
    }));

    return { entries };
  } catch {
    return { entries: [] };
  }
}

/**
 * Fetch lore entries from the wiki using index-first retrieval.
 *
 * Flow:
 * 1. Read index.md for first-pass filtering
 * 2. Score entries by relevance to scene context
 * 3. Read full content of top candidate pages
 * 4. Map to LoreContext shape
 *
 * @param userId - User ID for wiki path resolution (data/{userId}/wiki/)
 * @param universeId - Universe ID to filter pages by
 * @param sceneContext - Optional scene context for relevance scoring
 * @returns LoreContext with wiki entries (or empty if wiki unavailable)
 */
export async function getWikiContext(
  userId: string,
  universeId: string,
  sceneContext?: SceneContext
): Promise<LoreContext> {
  const wikiRoot = getWikiRoot(userId, universeId);

  // Build query from scene context for relevance scoring
  const queryParts: string[] = [];
  if (sceneContext?.location) queryParts.push(sceneContext.location);
  if (sceneContext?.goal) queryParts.push(sceneContext.goal);
  if (sceneContext?.activeNpcs?.length) queryParts.push(...sceneContext.activeNpcs);
  const query = queryParts.join(" ") || universeId;

  try {
    // Step 1: Read index.md
    const indexPath = path.join(wikiRoot, "index.md");
    if (!fs.existsSync(indexPath)) {
      return { entries: [] };
    }

    const indexEntries = parseWikiIndex(indexPath);
    if (indexEntries.length === 0) {
      return { entries: [] };
    }

    // Step 2: Score entries by relevance
    const scored = indexEntries
      .map((entry) => ({ entry, score: scoreWikiEntry(entry, query, universeId) }))
      .filter((s) => s.score > 0.1)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      // No relevant entries — load all wiki pages for this universe
      const wikiResult = loadAllWikiEntries(wikiRoot, universeId);
      if (wikiResult.entries.length > 0) return wikiResult;
      return { entries: [] };
    }

    // Step 3: Resolve top candidates to page paths and read content
    const allPages = listWikiPages(wikiRoot);
    const entries: LoreContext["entries"] = [];

    for (const { entry } of scored.slice(0, 10)) {
      const resolved = resolveWikiPagePath(entry.title, allPages, universeId);
      if (!resolved) continue;

      try {
        const page = readWikiPage(resolved);
        entries.push({
          id: hashPathToId(resolved),
          name: page.frontmatter.title || path.basename(resolved, ".md"),
          description: page.content.substring(0, 500),
          type: page.frontmatter.type || entry.section,
        });
      } catch {
        // Skip unreadable pages
      }
    }

    // --- Inject universe overview as the first lore entry (always included) ---
    // This ensures the AI always has world-level context about the setting.
    // Dedup: check if the overview was already loaded via scoring to avoid duplicates.
    let hasOverviewEntry = false;
    try {
      const aboutPath = path.join(wikiRoot, "concepts", "about.md");
      if (fs.existsSync(aboutPath)) {
        // Check if already present in entries
        hasOverviewEntry = entries.some(e =>
          e.type === "concept" && (e.name.toLowerCase().includes("overview") || e.name.toLowerCase().includes("universe"))
        );
        if (!hasOverviewEntry) {
          const overviewPage = readWikiPage(aboutPath);
          const overviewTitle = overviewPage.frontmatter.title || "Universe Overview";
          const overviewContent = (overviewPage.content || "").trim();
          if (overviewContent) {
            entries.unshift({
              id: -1,
              name: overviewTitle,
              description: overviewContent.substring(0, 500),
              type: "concept",
            });
            hasOverviewEntry = true;
          }
        }
      }
    } catch { /* non-blocking — universe overview is optional */ }

    if (entries.length > 0) {
      // Helper: ensure universe overview is never dropped by re-ranking slice()
      const ensureOverviewInResult = (result: LoreContext["entries"]): LoreContext["entries"] => {
        if (!hasOverviewEntry) return result;
        const hasIt = result.some(e => e.id === -1);
        if (hasIt) return result;
        // Overview was sliced out — find it in original entries and prepend
        const overview = entries.find(e => e.id === -1);
        if (overview) {
          result.pop(); // drop lowest-ranked entry to stay within budget
          result.unshift(overview);
        }
        return result;
      };

      // --- Entity mention boost for scoring (Task 25) — fetched once for both paths ---
      let mentionNames: string[] = [];
      try {
        const dbMention = getDb();
        const mentionRows = dbMention.prepare(
          "SELECT DISTINCT entity_name FROM entity_mentions WHERE user_id = ? AND frequency > 1 ORDER BY frequency DESC LIMIT 10"
        ).all(userId) as { entity_name: string }[];
        mentionNames = mentionRows.map(m => m.entity_name.toLowerCase());
      } catch { /* non-blocking */ }

      // --- Vector search hybrid scoring (additive enhancement) ---
      try {
        const queryEmbedding = await generateEmbedding(query, { userId });
        if (queryEmbedding && queryEmbedding.length > 0) {
          const db2 = getDb();
          const entryNames = entries.map(e => e.name);
          
          // Load stored embeddings for these entry names from embedding_vectors
          const vectorRows = db2.prepare(
            `SELECT ei.entity_id, ev.vector_data
             FROM embedding_vectors ev
             JOIN embedding_index ei ON ev.embedding_id = ei.id
             WHERE ei.user_id = ? AND ei.entity_id IN (${entryNames.map(() => '?').join(',')})`
          ).all(userId, ...entryNames) as { entity_id: string; vector_data: string }[];
          
          if (vectorRows.length > 0) {
            // Build lookup map: entity_id → vector
            const vectorMap = new Map<string, number[]>();
            for (const vr of vectorRows) {
              try {
                const parsed = JSON.parse(vr.vector_data);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  vectorMap.set(vr.entity_id, parsed);
                }
              } catch { /* skip invalid vectors */ }
            }
            
            if (vectorMap.size > 0) {
              // Compute hybrid scores: 0.6 × keyword_score + 0.4 × vector_similarity
              const withHybridScores = entries.map((entry, idx) => {
                const storedVector = vectorMap.get(entry.name);
                let vectorSimilarity = 0;
                if (storedVector) {
                  vectorSimilarity = cosineSimilarity(queryEmbedding, storedVector);
                }
                // keyword proxy: position-based (higher rank = higher score)
                const keywordScore = idx < vectorRows.length ? (vectorRows.length - idx) / vectorRows.length : 0.1;
                const hybridScore = vectorSimilarity > 0
                  ? 0.6 * keywordScore + 0.4 * vectorSimilarity
                  : keywordScore;
                // Entity mention boost (Task 25)
                const entryName = entry.name.toLowerCase();
                const entityBoost = mentionNames.length > 0 && mentionNames.some(m => entryName.includes(m) || m.includes(entryName)) ? 0.2 : 0;
                return { entry, hybridScore: hybridScore + entityBoost };
              });
              
              // Re-sort by hybrid score descending
              withHybridScores.sort((a, b) => b.hybridScore - a.hybridScore);
              
              const vectorEntries = withHybridScores.slice(0, 10).map(e => e.entry);
              return {
                entries: ensureOverviewInResult(vectorEntries)
              };
            }
          }
        }
      } catch {
        // Vector search unavailable — fall back to keyword-only results
      }

      // --- Entity mention boost (Task 25) — using hoisted mentionNames ---
      if (mentionNames.length > 0) {
        const withEntityBoost = entries.map((entry, idx) => {
          const entryName = entry.name.toLowerCase();
          const isMatched = mentionNames.some(m => entryName.includes(m) || m.includes(entryName));
          const entityBoost = isMatched ? 0.2 : 0;
          const keywordScore = entries.length > 0 ? (entries.length - idx) / entries.length : 0.1;
          return { entry, score: keywordScore + entityBoost, entityBoost };
        });
        withEntityBoost.sort((a, b) => b.score - a.score);
        return { entries: ensureOverviewInResult(withEntityBoost.slice(0, 10).map(e => e.entry)) };
      }

      return { entries: ensureOverviewInResult(entries) };
    }

    return { entries: [] };
  } catch {
    return { entries: [] };
  }
}

/**
 * Fetch NPC relationships for characters in the current universe
 */
export function getRelationshipContext(universeId: string): RelationshipContext {
  try {
    const db = getDb();
    const relationships = db.prepare(
      `SELECT r.source_entity, r.target_entity, r.emotional_state,
              r.relationship_stage, r.shared_history, r.updated_at
       FROM relationships r
       WHERE r.universe_id = ?
       ORDER BY r.updated_at DESC`
    ).all(universeId) as {
      source_entity: string; target_entity: string; emotional_state: string | null;
      relationship_stage: string | null; shared_history: string | null; updated_at: string | null;
    }[];

    return {
      relationships: (relationships || []).map((r) => {
        // Parse emotional_state JSON object if it's a valid JSON object
        let emotionalState: Record<string, number> | undefined;
        try {
          if (r.emotional_state && r.emotional_state !== 'null') {
            const parsed = JSON.parse(r.emotional_state);
            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
              emotionalState = parsed as Record<string, number>;
            }
          }
        } catch { /* keep undefined — not a JSON object, use raw state */ }

        // Parse shared_history JSON array (last 2 entries only)
        let sharedHistory: { type: string; summary: string; at: string }[] | undefined;
        try {
          if (r.shared_history && r.shared_history !== 'null') {
            const parsed = JSON.parse(r.shared_history);
            if (Array.isArray(parsed)) {
              sharedHistory = parsed.slice(0, 2) as { type: string; summary: string; at: string }[];
            }
          }
        } catch { /* keep undefined */ }

        return {
          source: r.source_entity,
          target: r.target_entity,
          state: r.emotional_state,
          emotionalState,
          stage: r.relationship_stage,
          sharedHistory,
          updatedAt: r.updated_at,
        };
      }),
    };
  } catch {
    return { relationships: [] };
  }
}

/**
 * Fetch relationship evolution history for a universe.
 * Returns up to the last 3 evolution entries per relationship,
 * ordered by recorded_at DESC.
 */
export function getRelationshipEvolution(
  universeId: string,
  limit: number = 3
): RetrievedContext['relationshipEvolution'] {
  try {
    const db = getDb();
    // Use a correlated subquery or window function to get last N per relationship
    const rows = db.prepare(`
      SELECT re.*, r.source_entity, r.target_entity
      FROM relationship_evolution re
      JOIN relationships r ON re.relationship_id = r.id
      WHERE r.universe_id = ?
      ORDER BY re.recorded_at DESC
    `).all(universeId) as {
      relationship_id: string;
      source_entity: string;
      target_entity: string;
      emotional_state: string | null;
      relationship_stage: string | null;
      trigger_event: string | null;
      recorded_at: string;
      [key: string]: unknown;
    }[];

    if (rows.length === 0) return undefined;

    // Group by relationship_id, take last N per group
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!grouped.has(row.relationship_id)) {
        grouped.set(row.relationship_id, []);
      }
      if (grouped.get(row.relationship_id)!.length < limit) {
        grouped.get(row.relationship_id)!.push(row);
      }
    }

    const result = Array.from(grouped.values()).flat().map(row => ({
      relationshipId: row.relationship_id,
      source: row.source_entity,
      target: row.target_entity,
      emotionalState: row.emotional_state,
      relationshipStage: row.relationship_stage,
      triggerEvent: row.trigger_event,
      recordedAt: row.recorded_at,
    }));

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Fetch recent decision points for a session.
 * Returns the 3 most recent decisions ordered by created_at DESC.
 * Only includes decisions where narrative context is still active
 * (not superseded by a more recent state change in the same session).
 */
export function getDecisionPoints(
  sessionId: string,
  limit: number = 3
): RetrievedContext['decisionPoints'] {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT prompt, choices_made, narrative_context
      FROM decision_points
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, limit) as {
      prompt: string;
      choices_made: string | null;
      narrative_context: string | null;
    }[];

    if (rows.length === 0) return undefined;

    return rows.map(r => ({
      prompt: r.prompt,
      choicesMade: safeParseWarn<string[]>(r.choices_made, "decision choices_made", []) ?? [],
      context: r.narrative_context ?? null,
    }));
  } catch {
    return undefined;
  }
}

/**
 * Fetch all non-deleted messages for a session (in chronological order).
 * No artificial limit — the dynamic context budget handles truncation.
 */
export function getRecentMessages(
  sessionId: string,
  _limit?: number
): MessageContext {
  const db = getDb();
  const messages = db.prepare(
    `SELECT m.id, m.sender_id as senderId, m.content, m.timestamp, u.username as senderName, p.name as personaName
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN personas p ON p.id = m.persona_id
     WHERE m.session_id = ? AND m.is_deleted = 0
     ORDER BY m.timestamp ASC`
  ).all(sessionId) as { id: string; senderId: string | null; content: string; timestamp: string; senderName: string | null; personaName: string | null }[];

  return { messages: messages || [] };
}

/**
 * Fetch semantically relevant past messages for the current user input.
 * Uses brute-force cosine similarity over embedding_vectors (JSON TEXT storage).
 * Works with any embedding model/dimension — no vec0 tables needed.
 * Gracefully returns empty array if no embeddings exist or on error.
 */
export async function getRelevantMessages(
  sessionId: string,
  userMessage: string,
  topK: number = 10000,
  excludeIds?: Set<string>
): Promise<{ content: string; senderId: string | null; timestamp: string }[]> {
  if (!userMessage || !userMessage.trim()) return [];

  const db = getDb();

  try {
    // Generate embedding for the user's query message
    const queryVec = await generateEmbedding(userMessage.trim());
    if (!queryVec || queryVec.length === 0) return [];

    // Fetch all message embeddings for this session
    const rows = db.prepare(`
      SELECT ei.entity_id, ev.vector_data
      FROM embedding_index ei
      JOIN embedding_vectors ev ON ei.id = ev.embedding_id
      WHERE ei.entity_type = 'message'
        AND ei.entity_id IN (
          SELECT id FROM messages WHERE session_id = ? AND is_deleted = 0
        )
    `).all(sessionId) as { entity_id: string; vector_data: string }[];

    if (!rows || rows.length === 0) return [];

    // Compute cosine similarity for each row
    const queryNorm = Math.sqrt(queryVec.reduce((sum, v) => sum + v * v, 0));
    if (queryNorm === 0) return [];

    interface ScoredResult {
      entityId: string;
      similarity: number;
    }

    const scored: ScoredResult[] = [];

    for (const row of rows) {
      // Skip excluded IDs (messages already in recent history)
      if (excludeIds?.has(row.entity_id)) continue;

      try {
        const vec = JSON.parse(row.vector_data) as number[];
        if (!Array.isArray(vec) || vec.length === 0) continue;

        // Cosine similarity
        let dot = 0;
        let vecNorm = 0;
        const len = Math.min(queryVec.length, vec.length);
        for (let i = 0; i < len; i++) {
          dot += queryVec[i] * vec[i];
          vecNorm += vec[i] * vec[i];
        }
        vecNorm = Math.sqrt(vecNorm);
        if (vecNorm === 0) continue;

        const similarity = dot / (queryNorm * vecNorm);
        scored.push({ entityId: row.entity_id, similarity });
      } catch {
        // Skip rows with malformed JSON
        continue;
      }
    }

    // Sort by similarity (highest first), take topK
    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.slice(0, topK);

    // Fetch message content for top results
    const results: { content: string; senderId: string | null; timestamp: string }[] = [];
    const seen = new Set<string>();

    for (const { entityId } of top) {
      if (seen.has(entityId)) continue;
      seen.add(entityId);

      const msg = db.prepare(
        "SELECT content, sender_id, timestamp FROM messages WHERE id = ? AND is_deleted = 0"
      ).get(entityId) as { content: string; sender_id: string | null; timestamp: string } | undefined;

      if (msg && msg.content) {
        results.push({
          content: msg.content,
          senderId: msg.sender_id,
          timestamp: msg.timestamp,
        });
      }
    }

    return results;
  } catch {
    // Graceful degradation — vector search is optional
    return [];
  }
}

/**
 * Fetch canon context for a universe
 */
export function getCanonContext(universeId: string): string | null {
  const db = getDb();
  const universe = db.prepare(
    `SELECT name, description, boundaries, canon_mode, tone, lore_source FROM universes WHERE id = ?`
  ).get(universeId) as {
    name: string;
    description: string | null;
    boundaries: string | null;
    canon_mode: string | null;
    tone: string | null;
    lore_source: string | null;
  } | undefined;

  if (!universe) return null;

  const parts: string[] = [];

  // Name is always included
  parts.push(`Name: ${universe.name}`);

  // Tone — was stored but never injected
  if (universe.tone) {
    parts.push(`Tone: ${universe.tone}`);
  }

  // Description — rich world description
  if (universe.description) {
    parts.push(`Description: ${universe.description}`);
  }

  // Lore source — reference URL or file path
  if (universe.lore_source) {
    parts.push(`Lore Source: ${universe.lore_source}`);
  }

  // Boundaries — explicit canon rules
  if (universe.boundaries) {
    const parsed = safeParseWarn<string[]>(universe.boundaries, "universe boundaries");
    const boundariesText = Array.isArray(parsed) ? parsed.join(", ") : universe.boundaries;
    if (boundariesText) {
      parts.push(`Boundaries: ${boundariesText}`);
    }
  }

  if (parts.length === 0) return null;

  const modeLabel =
    universe.canon_mode === "strict"
      ? "STRICT CANON"
      : universe.canon_mode === "loose"
        ? "LOOSE CANON"
        : "CUSTOM CANON";

  return `[CANON: ${modeLabel}]\n${parts.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Main retrieval pipeline
// ---------------------------------------------------------------------------

/**
 * Retrieve all context for a session to assemble into a prompt.
 * This is the main entry point for the retrieval pipeline.
 */
export async function getRetrievedContext(
  sessionId: string,
  universeId: string,
  userMessage?: string
): Promise<RetrievedContext> {
  const db = getDb();
  const scene = getSceneContext(sessionId);

  // Look up userId from session for wiki context + narrative state
  const session = db.prepare(
    "SELECT owner_id, narrative_tension, pacing, narrative_phase, active_goals, active_conflicts FROM sessions WHERE id = ?"
  ).get(sessionId) as { owner_id: string; narrative_tension: number | null; pacing: number | null; narrative_phase: string | null; active_goals: string | null; active_conflicts: string | null; } | undefined;
  const userId = session?.owner_id || "";

  const lore = userId
    ? await getWikiContext(userId, universeId, scene)
    : { entries: [] };
  const relationships = getRelationshipContext(universeId);
  const relationshipEvolution = getRelationshipEvolution(universeId);
  const recentMessages = getRecentMessages(sessionId);
  const canonContext = getCanonContext(universeId);

  const intent = userMessage ? classifyIntent(userMessage) : "social";

  // New retrieval integrations (Tasks 8-10)
  const memories = getMemoryContext(userId, sessionId, universeId);
  const narrativeThreads = getActiveThreads(sessionId, universeId);
  const messageSummaries = getMessageSummaries(sessionId);

  // Build exclude set from messages already in recent history
  const recentMsgIds = new Set(recentMessages.messages.map(m => m.id));

  // Fetch relevant past messages via vector search (Task C)
  const relevantMessages = userMessage
    ? await getRelevantMessages(sessionId, userMessage, 10000, recentMsgIds)
    : [];

  // Active entities from entity_mentions (Task 25)
  let activeEntities: string[] | undefined;
  try {
    const mentionRows = db.prepare(
      "SELECT entity_name FROM entity_mentions WHERE user_id = ? AND frequency > 1 GROUP BY entity_name ORDER BY MAX(frequency) DESC LIMIT 5"
    ).all(userId) as { entity_name: string }[];
    if (mentionRows.length > 0) {
      activeEntities = mentionRows.map(r => r.entity_name);
    }
  } catch { /* non-blocking */ }

  // Narrative anchors — significant relationship moments (Task 27)
  let relationshipAnchors: RetrievedContext["relationshipAnchors"];
  try {
    const anchorRows = db.prepare(`
      SELECT na.description, na.anchor_type, na.emotional_impact
      FROM narrative_anchors na
      JOIN relationships r ON r.id = na.relationship_id
      WHERE na.user_id = ? AND r.universe_id = ?
      ORDER BY na.created_at DESC
      LIMIT 20
    `).all(userId, universeId) as { description: string; anchor_type: string; emotional_impact: string | null }[];
    if (anchorRows.length > 0) {
      relationshipAnchors = anchorRows.map((a) => ({
        description: a.description,
        anchor_type: a.anchor_type,
        emotional_impact: a.emotional_impact ?? undefined,
      }));
    }
  } catch { /* non-blocking — anchors are optional context */ }

  // Decision points — narrative choices (Task 34)
  const decisionPoints = getDecisionPoints(sessionId);

  // Narrative state — session-level narrative fields (Task 35)
  let narrativeState: RetrievedContext["narrativeState"];
  if (session && (session.narrative_tension != null || session.pacing != null || session.narrative_phase != null || session.active_goals != null || session.active_conflicts != null)) {
    narrativeState = {
      tension: session.narrative_tension ?? null,
      pacing: session.pacing ?? null,
      narrativePhase: session.narrative_phase ?? null,
      activeGoals: session.active_goals ?? null,
      activeConflicts: session.active_conflicts ?? null,
    };
  }

  return {
    scene,
    lore,
    relationships,
    recentMessages,
    canonContext,
    intent,
    memories: memories ?? undefined,
    narrativeThreads: narrativeThreads ?? undefined,
    messageSummaries: messageSummaries ?? undefined,
    relevantMessages: relevantMessages.length > 0
      ? { messages: relevantMessages }
      : undefined,
    activeEntities: activeEntities ?? undefined,
    relationshipEvolution: relationshipEvolution ?? undefined,
    relationshipAnchors: relationshipAnchors ?? undefined,
    decisionPoints: decisionPoints ?? undefined,
    narrativeState: narrativeState ?? undefined,
  };
}
