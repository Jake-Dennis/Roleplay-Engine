import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { classifyIntent, type Intent } from "@/lib/intent-analyzer";
import { readWikiPage, listWikiPages } from "@/lib/wiki/file-io";
import { parseWikiIndex, scoreWikiEntry, resolveWikiPagePath } from "@/lib/wiki/index-utils";
import { safeParseWarn } from "@/lib/safe-json";
import { getWikiRoot } from "@/lib/wiki/wiki-root";

// H5: Re-export prompt assembly function from canonical source (prompt-builder.ts)
export { assemblePromptWithBudget } from "@/lib/prompt-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneContext {
  location: string | null;
  goal: string | null;
  tone: string | null;
  activeNpcs: string[];
  activeThreads: string[];
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

// ---------------------------------------------------------------------------
// Retrieval functions
// ---------------------------------------------------------------------------

/**
 * Fetch the current scene state for a session
 */
export function getSceneContext(sessionId: string): SceneContext {
  const db = getDb();
  const result = db.prepare(
    `SELECT active_location_id, current_goal, emotional_tone, active_npcs, active_threads
     FROM scene_states
     WHERE session_id = ?
     ORDER BY updated_at DESC LIMIT 1`
  ).get(sessionId) as {
    active_location_id: string | null;
    current_goal: string | null;
    emotional_tone: string | null;
    active_npcs: string | null;
    active_threads: string | null;
  } | undefined;

  if (!result) {
    return { location: null, goal: null, tone: null, activeNpcs: [], activeThreads: [] };
  }

  return {
    location: result.active_location_id,
    goal: result.current_goal,
    tone: result.emotional_tone,
    activeNpcs: parseJsonOrSplit(result.active_npcs),
    activeThreads: parseJsonOrSplit(result.active_threads),
  };
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

    if (entries.length > 0) {
      return { entries };
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
    const parsed = safeParseWarn<string[]>(universe.boundaries, "universe boundaries");
    boundariesText = Array.isArray(parsed) ? parsed.join(", ") : universe.boundaries;
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
  const db = getDb();
  const scene = getSceneContext(sessionId);

  // Look up userId from session for wiki context
  const session = db.prepare(
    "SELECT owner_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { owner_id: string } | undefined;
  const userId = session?.owner_id || "";

  const lore = userId
    ? await getWikiContext(userId, universeId, scene)
    : { entries: [] };
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
