/**
 * NPC → Wiki Sync Job Handler
 *
 * After NPC evolution updates traits, syncs the changes to the
 * corresponding wiki entity page. Unidirectional: NPC → Wiki only.
 *
 * Job type: npc_wiki_sync
 *
 * Flow:
 *   1. Fetch NPC from DB
 *   2. Find wiki entity page matching NPC name
 *   3. Skip if page is locked
 *   4. Update body traits section and frontmatter timestamp
 *   5. Write page back to disk
 */

import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { readWikiPage, writeWikiPage, listWikiPages } from "@/lib/wiki/file-io";
import { isLocked } from "@/lib/wiki/validation";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";

// ---------------------------------------------------------------------------
// Job Handler
// ---------------------------------------------------------------------------

/**
 * npc_wiki_sync: Sync updated NPC traits to the corresponding wiki entity page.
 */
export async function handleNpcWikiSync(
  jobId: string,
  payload: JobPayload
): Promise<JobResult> {
  const { userId, npcId, universeId } = payload;
  if (!userId || !npcId) {
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_wiki_sync",
      data: { skipped: true, reason: "missing_params" },
    };
  }

  const db = getDb();

  updateJobProgress(jobId, 10, "Fetching NPC data...");

  // Fetch NPC from DB
  const npc = db.prepare(
    "SELECT id, name, description, personality_traits, behavior_patterns FROM npcs WHERE id = ? AND user_id = ?"
  ).get(npcId, userId) as {
    id: string;
    name: string;
    description: string | null;
    personality_traits: string | null;
    behavior_patterns: string | null;
  } | undefined;

  if (!npc) {
    logger.warn(`[npc-wiki-sync] NPC not found: id=${npcId}, user=${userId}`);
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_wiki_sync",
      data: { skipped: true, reason: "npc_not_found", npcId },
    };
  }

  updateJobProgress(jobId, 30, "Finding wiki entity page...");

  // Get wiki root directory
  let wikiRoot: string;
  try {
    wikiRoot = getWikiRoot(userId as string, universeId as string | undefined);
  } catch (err) {
    logger.warn(
      `[npc-wiki-sync] Invalid wiki root for user=${userId}: ${err}`
    );
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_wiki_sync",
      data: { skipped: true, reason: "invalid_wiki_root" },
    };
  }

  // Scan all wiki pages for an entity matching the NPC name
  const allPages = listWikiPages(wikiRoot);
  const entityPage = allPages.find(
    (p) =>
      p.frontmatter.type === "entity" &&
      p.frontmatter.title.toLowerCase() === npc.name.toLowerCase()
  );

  if (!entityPage) {
    logger.info(
      `[npc-wiki-sync] No entity page found for NPC "${npc.name}" (id=${npcId}) — skipping`
    );
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_wiki_sync",
      data: { skipped: true, reason: "no_entity_page", npcName: npc.name },
    };
  }

  updateJobProgress(jobId, 50, "Checking lock status...");

  // Skip if the wiki page is locked (immutable)
  const locked = await isLocked(entityPage.path);
  if (locked) {
    logger.info(
      `[npc-wiki-sync] Entity page "${entityPage.path}" is locked — skipping`
    );
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_wiki_sync",
      data: { skipped: true, reason: "page_locked", npcName: npc.name },
    };
  }

  updateJobProgress(jobId, 70, "Updating wiki page body...");

  // Read fresh page content
  const page = readWikiPage(entityPage.path);
  let body = page.content;
  const frontmatter = { ...page.frontmatter };

  // Build the new traits section from NPC data
  const traitsSection = buildTraitsSection(npc);

  // Replace or append traits content in the page body
  body = updateBodyTraitsSection(body, traitsSection);

  // Write page back (writeWikiPage auto-sets frontmatter.updated)
  try {
    writeWikiPage(entityPage.path, body, frontmatter);
  } catch (err) {
    logger.warn(
      `[npc-wiki-sync] Failed to write wiki page "${entityPage.path}": ${err}`
    );
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_wiki_sync",
      data: { skipped: true, reason: "write_failed", npcName: npc.name },
    };
  }

  updateJobProgress(jobId, 100, "Wiki sync complete");

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "npc_wiki_sync",
    data: {
      npcName: npc.name,
      pagePath: entityPage.path,
      traitsUpdated: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build a markdown traits section from NPC data.
 *
 * Output format:
 *   **Traits:**
 *   - trait_name: 0.85
 *   - aggression: 0.42
 *
 *   **Behavior Patterns:**
 *   - responds well to authority
 */
export function buildTraitsSection(npc: {
  name: string;
  description: string | null;
  personality_traits: string | null;
  behavior_patterns: string | null;
}): string {
  const lines: string[] = [];
  lines.push("**Traits:**");

  // Parse personality_traits JSON
  if (npc.personality_traits) {
    try {
      const traits = JSON.parse(npc.personality_traits) as Record<
        string,
        unknown
      >;
      for (const [key, value] of Object.entries(traits)) {
        lines.push(`- ${key}: ${value}`);
      }
    } catch {
      // If not valid JSON, include raw string
      lines.push(`- ${npc.personality_traits}`);
    }
  } else {
    lines.push("- (no traits defined)");
  }

  // Add behavior patterns if present
  if (npc.behavior_patterns) {
    lines.push("");
    lines.push("**Behavior Patterns:**");
    try {
      const patterns = JSON.parse(npc.behavior_patterns) as string[];
      for (const pattern of patterns) {
        lines.push(`- ${pattern}`);
      }
    } catch {
      lines.push(`- ${npc.behavior_patterns}`);
    }
  }

  return lines.join("\n");
}

/**
 * Update the body of a wiki page with new traits content.
 *
 * Tries in order:
 *   1. Replace existing `**Traits:**` inline section
 *   2. Replace existing `## Personality` section
 *   3. Append `## NPC Evolution` section at end
 */
export function updateBodyTraitsSection(body: string, traitsSection: string): string {
  // Pattern 1: Replace **Traits:** inline section — finds from **Traits:** to next heading or EOF
  const traitsRegex = /\*\*Traits:\*\*[\s\S]*?(?=\n\s*#|\n*$)/;
  if (traitsRegex.test(body)) {
    return body.replace(traitsRegex, traitsSection);
  }

  // Pattern 2: Replace ## Personality section entirely — finds from heading to next ## or EOF
  const personalityRegex = /##\s+Personality[\s\S]*?(?=\n##\s|\n*$)/;
  if (personalityRegex.test(body)) {
    return body.replace(personalityRegex, traitsSection);
  }

  // Pattern 3: No existing section found — append new NPC Evolution section
  const trimmed = body.trimEnd();
  return trimmed + `\n\n## NPC Evolution\n\n${traitsSection}\n`;
}
