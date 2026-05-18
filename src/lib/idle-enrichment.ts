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

export interface EnrichmentResult {
  tier: number;
  actionsCompleted: string[];
  itemsProcessed: number;
}

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
  };

  if (idleMinutes < 5) return result;

  // Tier 1: > 5 minutes
  if (idleMinutes >= 5) {
    result.tier = 1;
    const compressed = await compressOldSummaries(userId, universeId);
    if (compressed > 0) {
      result.actionsCompleted.push("compressOldSummaries");
      result.itemsProcessed += compressed;
    }

    const refined = await refineRelationshipSummaries(userId, universeId);
    if (refined > 0) {
      result.actionsCompleted.push("refineRelationshipSummaries");
      result.itemsProcessed += refined;
    }
  }

  // Tier 2: > 10 minutes
  if (idleMinutes >= 10) {
    result.tier = 2;
    const deepened = await deepenActiveLocations(userId, universeId);
    if (deepened > 0) {
      result.actionsCompleted.push("deepenActiveLocations");
      result.itemsProcessed += deepened;
    }

    const enriched = await enrichNPCBackstories(userId, universeId);
    if (enriched > 0) {
      result.actionsCompleted.push("enrichNPCBackstories");
      result.itemsProcessed += enriched;
    }
  }

  // Tier 3: > 15 minutes
  if (idleMinutes >= 15) {
    result.tier = 3;
    const rumors = await expandRumors(userId, universeId);
    if (rumors > 0) {
      result.actionsCompleted.push("expandRumors");
      result.itemsProcessed += rumors;
    }

    const archived = await archiveLowImportanceMemories(userId, universeId);
    if (archived > 0) {
      result.actionsCompleted.push("archiveLowImportanceMemories");
      result.itemsProcessed += archived;
    }
  }

  // Tier 4: > 30 minutes
  if (idleMinutes >= 30) {
    result.tier = 4;
    if (needsDecayProcessing(userId)) {
      const decayResult = processRelationshipDecay(userId);
      if (decayResult.decayedCount > 0) {
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

    const fs = require("fs");
    const path = require("path");
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
