/**
 * Lore Expansion with Contradiction Checks
 * 
 * Generates new lore entries based on session activity and validates them
 * against existing canon to prevent contradictions. New lore is marked as
 * "generated_unverified" and requires user review before becoming canon.
 * 
 * Expansion triggers:
 * - During idle-time processing (15-minute tier)
 * - When new locations/NPCs are mentioned but don't exist
 * - When session activity reveals new world-building details
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { writeLoreFile, sanitizeFilename } from "@/lib/lore-markdown";
import { detectContradictions, detectAllContradictionsWithSemantic } from "@/lib/contradiction-detector";

export interface LoreExpansionResult {
  expandedCount: number;
  newLoreIds: string[];
  contradictions: { entity: string; conflict: string }[];
}

/**
 * Expand lore for a universe based on recent session activity
 */
export async function processLoreExpansion(
  userId: string,
  universeId: string
): Promise<LoreExpansionResult> {
  const db = getDb();

  // Get universe info
  const universe = db.prepare(
    "SELECT name, canon_mode, lore_source, tone, boundaries FROM universes WHERE id = ? AND user_id = ?"
  ).get(universeId, userId) as {
    name: string;
    canon_mode: string;
    lore_source: string | null;
    tone: string | null;
    boundaries: string | null;
  } | undefined;

  if (!universe) {
    throw new Error(`Universe ${universeId} not found for user ${userId}`);
  }

  // Get recent sessions for this universe
  const sessions = db.prepare(`
    SELECT id, name FROM sessions
    WHERE universe_id = ? AND owner_id = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 5
  `).all(universeId, userId) as { id: string; name: string }[];

  // Get existing lore (locations, NPCs) for this universe
  const existingLocations = db.prepare(
    "SELECT name, known_info FROM locations WHERE universe_id = ?"
  ).all(universeId) as { name: string; known_info: string | null }[];

  const existingNpcs = db.prepare(
    "SELECT name, tags FROM npcs WHERE universe_id = ?"
  ).all(universeId) as { name: string; tags: string | null }[];

  // Get recent messages from sessions
  const recentMessages: { content: string; session_name: string }[] = [];
  for (const session of sessions) {
    const msgs = db.prepare(`
      SELECT content FROM messages
      WHERE session_id = ? AND is_deleted = 0
      ORDER BY timestamp DESC
      LIMIT 10
    `).all(session.id) as { content: string }[];

    for (const msg of msgs) {
      recentMessages.push({ content: msg.content, session_name: session.name });
    }
  }

  if (recentMessages.length < 5) {
    return { expandedCount: 0, newLoreIds: [], contradictions: [] };
  }

  // Generate new lore candidates
  const loreCandidates = await generateLoreCandidates(
    universe,
    existingLocations,
    existingNpcs,
    recentMessages
  );

  // Check for contradictions
  const contradictions = await checkContradictions(
    universe,
    existingLocations,
    existingNpcs,
    loreCandidates
  );

  // Filter out contradictory lore
  const validCandidates = loreCandidates.filter(
    (c) => !contradictions.some((ctr) => ctr.entity === c.name)
  );

  // Create new lore entries
  const newLoreIds: string[] = [];
  for (const candidate of validCandidates) {
    const loreId = await createLoreEntry(userId, universeId, candidate);
    if (loreId) {
      newLoreIds.push(loreId);
    }
  }

  return {
    expandedCount: newLoreIds.length,
    newLoreIds,
    contradictions,
  };
}

/**
 * Generate lore candidates using AI
 */
async function generateLoreCandidates(
  universe: { name: string; canon_mode: string; lore_source: string | null; tone: string | null; boundaries: string | null },
  existingLocations: { name: string; known_info: string | null }[],
  existingNpcs: { name: string; tags: string | null }[],
  recentMessages: { content: string; session_name: string }[]
): Promise<{
  name: string;
  type: "location" | "npc";
  description: string;
  importance: "low" | "medium" | "high";
}[]> {
  const existingText = [
    ...existingLocations.map((l) => `Location: ${l.name} - ${l.known_info || "no details"}`),
    ...existingNpcs.map((n) => `NPC: ${n.name} - ${n.tags || "no details"}`),
  ].join("\n");

  const messageText = recentMessages
    .map((m) => `[${m.session_name}] ${m.content}`)
    .join("\n");

  const prompt = `You are expanding the lore for a roleplay universe.

Universe: ${universe.name}
Canon Mode: ${universe.canon_mode}
Tone: ${universe.tone || "unspecified"}
Boundaries: ${universe.boundaries || "none specified"}

Existing lore:
${existingText || "No existing lore"}

Recent session activity:
${messageText}

Based on the recent session activity, suggest 2-3 new lore entries (locations or NPCs) that would enrich this universe. These should be things that were mentioned or implied but don't exist yet.

Format as JSON array:
[
  {
    "name": "Name of the location or NPC",
    "type": "location" or "npc",
    "description": "Detailed description fitting the universe tone",
    "importance": "low", "medium", or "high"
  }
]

Do NOT suggest anything that already exists. Only suggest genuinely new entries.`;

  try {
    const response = await generateText(prompt, { temperature: 0.7, num_ctx: 8192 });

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((c: any) => c.name && c.type && c.description)
      .map((c: any) => ({
        name: c.name,
        type: c.type === "npc" ? "npc" : "location",
        description: c.description,
        importance: ["low", "medium", "high"].includes(c.importance) ? c.importance : "medium",
      }));
  } catch {
    return [];
  }
}

/**
 * Check lore candidates for contradictions with existing canon
 */
async function checkContradictions(
  universe: { name: string; canon_mode: string; lore_source: string | null },
  existingLocations: { name: string; known_info: string | null }[],
  existingNpcs: { name: string; tags: string | null }[],
  candidates: { name: string; type: string; description: string }[]
): Promise<{ entity: string; conflict: string }[]> {
  if (universe.canon_mode !== "strict") {
    return []; // Only check contradictions in strict canon mode
  }

  const existingText = [
    ...existingLocations.map((l) => `Location: ${l.name} - ${l.known_info || "no details"}`),
    ...existingNpcs.map((n) => `NPC: ${n.name} - ${n.tags || "no details"}`),
  ].join("\n");

  const candidateText = candidates
    .map((c) => `${c.type}: ${c.name} - ${c.description}`)
    .join("\n");

  const prompt = `Check these proposed lore entries for contradictions with existing canon.

Universe: ${universe.name}
Canon Source: ${universe.lore_source || "none specified"}

Existing canon:
${existingText}

Proposed new entries:
${candidateText}

For each proposed entry that contradicts existing canon, explain the conflict.

Format as JSON array:
[
  {
    "entity": "name of the conflicting entity",
    "conflict": "description of the contradiction"
  }
]

Return an empty array if there are no contradictions.`;

  try {
    const response = await generateText(prompt, { temperature: 0.1, num_ctx: 4096 });

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((c: any) => c.entity && c.conflict)
      .map((c: any) => ({
        entity: c.entity,
        conflict: c.conflict,
      }));
  } catch {
    return [];
  }
}

/**
 * Create a new lore entry in the database
 */
async function createLoreEntry(
  userId: string,
  universeId: string,
  candidate: { name: string; type: string; description: string; importance: string }
): Promise<string | null> {
  const db = getDb();
  const loreId = crypto.randomUUID();

  if (candidate.type === "location") {
    // Write markdown file
    const filename = `${sanitizeFilename(candidate.name)}.md`;
    const content = `# ${candidate.name}\n\n**Importance:** ${candidate.importance}\n\n${candidate.description}\n`;
    const filePath = writeLoreFile(userId, "locations", filename, content);

    db.prepare(`
      INSERT INTO locations (id, user_id, name, file_path, importance, known_info, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(loreId, userId, candidate.name, filePath, candidate.importance, candidate.description);

    // Create lore validation entry
    const validationId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by, created_at)
      VALUES (?, ?, 'location', ?, 'generated_unverified', 'ai_expansion', CURRENT_TIMESTAMP)
    `).run(validationId, userId, loreId);

    // Run rule-based contradiction detection
    detectContradictions("locations", loreId, userId);

    // Run semantic contradiction detection
    try {
      await detectAllContradictionsWithSemantic("locations", loreId, userId);
    } catch {
      // Semantic check failed — rule-based still ran
    }
  } else if (candidate.type === "npc") {
    const filename = `${sanitizeFilename(candidate.name)}.md`;
    const content = `# ${candidate.name}\n\n**Importance:** ${candidate.importance}\n\n${candidate.description}\n`;
    const filePath = writeLoreFile(userId, "npcs", filename, content);

    db.prepare(`
      INSERT INTO npcs (id, user_id, name, file_path, canon_tier, tags, created_at)
      VALUES (?, ?, ?, ?, 'generated_lore', ?, CURRENT_TIMESTAMP)
    `).run(loreId, userId, candidate.name, filePath, candidate.description);

    const validationId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by, created_at)
      VALUES (?, ?, 'npc', ?, 'generated_unverified', 'ai_expansion', CURRENT_TIMESTAMP)
    `).run(validationId, userId, loreId);

    // Run rule-based contradiction detection
    detectContradictions("npcs", loreId, userId);

    // Run semantic contradiction detection
    try {
      await detectAllContradictionsWithSemantic("npcs", loreId, userId);
    } catch {
      // Semantic check failed — rule-based still ran
    }
  }

  return loreId;
}

/**
 * Get universes that need lore expansion for a user
 */
export function getUniversesNeedingLoreExpansion(userId: string): string[] {
  const db = getDb();

  // Get universes with active sessions that have recent activity
  const universes = db.prepare(`
    SELECT DISTINCT s.universe_id
    FROM sessions s
    WHERE s.owner_id = ?
      AND s.status = 'active'
      AND s.universe_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM messages m
        WHERE m.session_id = s.id
          AND m.is_deleted = 0
          AND m.timestamp > datetime('now', '-1 hour')
      )
  `).all(userId) as { universe_id: string }[];

  return universes.map((u) => u.universe_id);
}
