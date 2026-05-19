import fs from "fs";
import path from "path";
import { getDb, isVecAvailable } from "@/lib/db";
import { classifyIntent, type Intent } from "@/lib/intent-analyzer";
import { classifyIntentWithFallback } from "@/lib/semantic-intent-fallback";
import { generateEmbedding } from "@/lib/ollama";
import { vectorSearch } from "@/lib/embeddings";
import { readWikiPage, listWikiPages } from "@/lib/wiki/file-io";

// H5: Re-export prompt assembly functions from canonical source (prompt-builder.ts)
export {
  assemblePrompt,
  assemblePromptWithBudget,
  estimateTokens,
  applyContextBudget,
  buildIntentContext,
} from "@/lib/prompt-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneContext {
  location: string | null;
  goal: string | null;
  tone: string | null;
  activeNpcs: string[];
}

export interface LoreContext {
  entries: { id: number; name: string; description: string; type: string }[];
}

export interface RelationshipContext {
  relationships: { source: string; target: string; state: string | null }[];
}

export interface MessageContext {
  messages: { senderId: string | null; content: string; timestamp: string }[];
}

export interface RetrievedContext {
  scene: SceneContext;
  lore: LoreContext;
  relationships: RelationshipContext;
  recentMessages: MessageContext;
  canonContext: string | null;
  intent: Intent;
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
    `SELECT active_location_id, current_goal, emotional_tone, active_npcs
     FROM scene_states
     WHERE session_id = ?
     ORDER BY updated_at DESC LIMIT 1`
  ).get(sessionId) as {
    active_location_id: string | null;
    current_goal: string | null;
    emotional_tone: string | null;
    active_npcs: string | null;
  } | undefined;

  if (!result) {
    return { location: null, goal: null, tone: null, activeNpcs: [] };
  }

  return {
    location: result.active_location_id,
    goal: result.current_goal,
    tone: result.emotional_tone,
    activeNpcs: result.active_npcs
      ? result.active_npcs.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
  };
}

/**
 * Fetch lore entries relevant to a session's universe
 * Lore data comes from locations and NPCs with descriptions
 * Uses vector search when sqlite-vec is available
 */
export async function getLoreContext(universeId: string, query?: string): Promise<LoreContext> {
  const db = getDb();

  // If vector search is available and we have a query, use it
  if (isVecAvailable() && query) {
    try {
      const queryVector = await generateEmbedding(query);

      // Search for relevant lore
      const loreResults = vectorSearch("location", queryVector, universeId, 5);
      const npcResults = vectorSearch("npc", queryVector, universeId, 5);

      // Get full lore entries for matched entities
      const matchedLocationIds = loreResults.map((r) => r.entityId);
      const matchedNpcIds = npcResults.map((r) => r.entityId);

      const locations = matchedLocationIds.length > 0
        ? db.prepare(
            `SELECT id, name, known_info as description, 'location' as type
             FROM locations
             WHERE id IN (${matchedLocationIds.map(() => "?").join(",")})
          `).all(...matchedLocationIds) as { id: number; name: string; description: string; type: string }[]
        : [];

      const npcs = matchedNpcIds.length > 0
        ? db.prepare(
            `SELECT id, name, tags as description, 'npc' as type
             FROM npcs
             WHERE id IN (${matchedNpcIds.map(() => "?").join(",")})
          `).all(...matchedNpcIds) as { id: number; name: string; description: string; type: string }[]
        : [];

      const allEntries = [
        ...(locations || []).map((l: any) => ({
          id: l.id,
          name: l.name,
          description: typeof l.description === 'string' ? l.description : (l.description ? JSON.stringify(l.description) : ''),
          type: l.type,
        })),
        ...(npcs || []).map((n: any) => ({
          id: n.id,
          name: n.name,
          description: typeof n.description === 'string' ? n.description : (n.description ? JSON.stringify(n.description) : ''),
          type: n.type,
        })),
      ];

      if (allEntries.length > 0) {
        return { entries: allEntries };
      }
    } catch {
      // Fall back to keyword-based retrieval
    }
  }

  // Fallback: keyword-based retrieval
  const locations = db.prepare(
    `SELECT id, name, known_info as description, 'location' as type
     FROM locations
     WHERE universe_id = ?
     ORDER BY name`
  ).all(universeId) as { id: number; name: string; description: string; type: string }[];

  const npcs = db.prepare(
    `SELECT id, name, tags as description, 'npc' as type
     FROM npcs
     WHERE universe_id = ?
     ORDER BY name`
  ).all(universeId) as { id: number; name: string; description: string; type: string }[];

  const allEntries = [
    ...(locations || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      description: typeof l.description === 'string' ? l.description : (l.description ? JSON.stringify(l.description) : ''),
      type: l.type,
    })),
    ...(npcs || []).map((n: any) => ({
      id: n.id,
      name: n.name,
      description: typeof n.description === 'string' ? n.description : (n.description ? JSON.stringify(n.description) : ''),
      type: n.type,
    })),
  ];

  return { entries: allEntries };
}

// ---------------------------------------------------------------------------
// Wiki-first retrieval (internal helpers)
// ---------------------------------------------------------------------------

/** Parsed entry from wiki index.md. */
interface WikiIndexEntry {
  title: string;
  summary: string;
  status: string;
  section: string; // entity, concept, source, synthesis
}

/**
 * Parse wiki index.md into structured entries grouped by section.
 * Expected format:
 *   ## Entities
 *   - [[Title]] — summary (status: reviewed)
 */
function parseWikiIndex(indexPath: string): WikiIndexEntry[] {
  if (!fs.existsSync(indexPath)) return [];

  const content = fs.readFileSync(indexPath, "utf-8");
  const entries: WikiIndexEntry[] = [];
  let currentSection = "";

  for (const line of content.split("\n")) {
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      continue;
    }

    const entryMatch = line.match(/^-\s+\[\[([^\]]+)\]\]\s*[—-]\s*(.+)$/);
    if (entryMatch) {
      const title = entryMatch[1].trim();
      const rest = entryMatch[2].trim();
      const statusMatch = rest.match(/\(status:\s*(\w+)\)\s*$/);
      const status = statusMatch ? statusMatch[1] : "draft";
      const summary = statusMatch
        ? rest.replace(/\(status:\s*\w+\)\s*$/, "").trim()
        : rest;

      entries.push({ title, summary, status, section: currentSection });
    }
  }

  return entries;
}

/**
 * Score a wiki index entry's relevance to a query using keyword overlap.
 */
function scoreWikiEntry(entry: WikiIndexEntry, query: string, universeId: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return 0;

  const searchable = `${entry.title} ${entry.summary} ${entry.section}`.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) {
    if (searchable.includes(term)) matches++;
  }

  let score = matches / queryTerms.length;

  // Bonus for title match
  if (entry.title.toLowerCase().includes(queryTerms[0])) score += 0.3;

  // Bonus for reviewed/locked status
  if (entry.status === "locked") score += 0.15;
  else if (entry.status === "reviewed") score += 0.1;

  // Bonus for universe-scoped sections
  if (universeId && (entry.section === "entity" || entry.section === "concept")) {
    score += 0.05;
  }

  return Math.min(score, 1.0);
}

/**
 * Resolve an index entry title to an actual wiki page path.
 */
function resolveWikiPagePath(
  title: string,
  pages: ReturnType<typeof listWikiPages>,
  universeId: string
): string | null {
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, "-");

  // First pass: exact title match + same universe
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "").toLowerCase().replace(/\s+/g, "-");
    const pageUniverse = page.frontmatter.universe?.toLowerCase();
    if (pageTitle === normalizedTitle && pageUniverse === universeId) {
      return page.path;
    }
  }

  // Second pass: exact title match (any universe)
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "").toLowerCase().replace(/\s+/g, "-");
    if (pageTitle === normalizedTitle) return page.path;
  }

  // Third pass: filename match
  for (const page of pages) {
    const filename = path.basename(page.path, ".md").toLowerCase();
    if (filename === normalizedTitle) return page.path;
  }

  return null;
}

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

    const statusPriority: Record<string, number> = { locked: 0, reviewed: 1, draft: 2, rejected: 3 };
    filtered.sort(
      (a, b) =>
        (statusPriority[a.frontmatter.status ?? "draft"] ?? 2) -
        (statusPriority[b.frontmatter.status ?? "draft"] ?? 2)
    );

    const entries = filtered.slice(0, 20).map((page) => ({
      id: hashPathToId(page.path),
      name: page.frontmatter.title || path.basename(page.path, ".md"),
      description: page.content.substring(0, 500),
      type: page.frontmatter.type || page.frontmatter.section || "entity",
    }));

    return { entries };
  } catch {
    return { entries: [] };
  }
}

// ---------------------------------------------------------------------------
// Wiki-first retrieval (main entry point)
// ---------------------------------------------------------------------------

/**
 * Fetch lore entries from the wiki using index-first retrieval.
 *
 * Flow:
 * 1. Read index.md for first-pass filtering
 * 2. Score entries by relevance to scene context
 * 3. Read full content of top candidate pages
 * 4. Map to LoreContext shape
 * 5. Fall back to DB (getLoreContext) if wiki unavailable
 *
 * Feature flag: Set process.env.WIKI_FIRST="true" to use wiki as primary source.
 * When the flag is not set, callers should prefer getLoreContext() for DB-first.
 *
 * @param userId - User ID for wiki path resolution (data/{userId}/wiki/)
 * @param universeId - Universe ID to filter pages by
 * @param sceneContext - Optional scene context for relevance scoring
 * @returns LoreContext with wiki entries (or DB fallback)
 */
export async function getWikiContext(
  userId: string,
  universeId: string,
  sceneContext?: SceneContext
): Promise<LoreContext> {
  const wikiRoot = path.join(process.cwd(), "data", userId, "wiki");

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
      return getLoreContext(universeId, query);
    }

    const indexEntries = parseWikiIndex(indexPath);
    if (indexEntries.length === 0) {
      return getLoreContext(universeId, query);
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
      return getLoreContext(universeId, query);
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

    if (entries.length > 0) {
      return { entries };
    }

    // Step 4: DB fallback
    return getLoreContext(universeId, query);
  } catch {
    // Any error — fall back to DB
    return getLoreContext(universeId, query);
  }
}

/**
 * Fetch NPC relationships for characters in the current universe
 */
export function getRelationshipContext(universeId: string): RelationshipContext {
  try {
    const db = getDb();
    // relationships table: source_entity, target_entity, emotional_state
    const relationships = db.prepare(
      `SELECT r.source_entity, r.target_entity, r.emotional_state
       FROM relationships r
       WHERE r.universe_id = ?
       ORDER BY r.updated_at DESC`
    ).all(universeId) as { source_entity: string; target_entity: string; emotional_state: string | null }[];

    return {
      relationships: (relationships || []).map((r) => ({
        source: r.source_entity,
        target: r.target_entity,
        state: r.emotional_state,
      })),
    };
  } catch {
    return { relationships: [] };
  }
}

/**
 * Fetch the most recent N messages for a session
 */
export function getRecentMessages(
  sessionId: string,
  limit: number = 30
): MessageContext {
  const db = getDb();
  const messages = db.prepare(
    `SELECT sender_id as senderId, content, timestamp
     FROM messages
     WHERE session_id = ? AND is_deleted = 0
     ORDER BY timestamp ASC
     LIMIT ?`
  ).all(sessionId, limit) as { senderId: string | null; content: string; timestamp: string }[];

  return { messages: messages || [] };
}

/**
 * Fetch canon context for a universe
 */
export function getCanonContext(universeId: string): string | null {
  const db = getDb();
  const universe = db.prepare(
    `SELECT name, boundaries, canon_mode FROM universes WHERE id = ?`
  ).get(universeId) as { name: string; boundaries: string | null; canon_mode: string | null } | undefined;

  if (!universe) return null;

  let boundariesText = "";
  if (universe.boundaries) {
    try {
      const parsed = JSON.parse(universe.boundaries);
      boundariesText = Array.isArray(parsed) ? parsed.join(", ") : universe.boundaries;
    } catch {
      boundariesText = universe.boundaries;
    }
  }

  const context = boundariesText || universe.name;
  if (!context) return null;

  const modeLabel =
    universe.canon_mode === "strict"
      ? "STRICT CANON"
      : universe.canon_mode === "loose"
        ? "LOOSE CANON"
        : "CUSTOM CANON";

  return `[CANON: ${modeLabel}]\n${context}`;
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
  const scene = getSceneContext(sessionId);
  const lore = await getLoreContext(universeId, userMessage);
  const relationships = getRelationshipContext(universeId);
  const recentMessages = getRecentMessages(sessionId);
  const canonContext = getCanonContext(universeId);

  const intent = userMessage ? classifyIntent(userMessage) : "social";

  return {
    scene,
    lore,
    relationships,
    recentMessages,
    canonContext,
    intent,
  };
}

/**
 * Retrieve context with semantic intent fallback for ambiguous inputs.
 * D4: Uses embeddings to find similar past interactions when keyword
 * classification is uncertain.
 */
export async function getRetrievedContextWithFallback(
  sessionId: string,
  universeId: string,
  userId: string,
  userMessage?: string
): Promise<RetrievedContext> {
  const scene = getSceneContext(sessionId);
  const lore = await getLoreContext(universeId, userMessage);
  const relationships = getRelationshipContext(universeId);
  const recentMessages = getRecentMessages(sessionId);
  const canonContext = getCanonContext(universeId);

  let intent: Intent = "social";
  if (userMessage) {
    try {
      const result = await classifyIntentWithFallback(userId, userMessage);
      intent = result.intent;
    } catch {
      // Fallback to fast keyword classifier
      intent = classifyIntent(userMessage);
    }
  }

  return {
    scene,
    lore,
    relationships,
    recentMessages,
    canonContext,
    intent,
  };
}
