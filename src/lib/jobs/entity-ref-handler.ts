/**
 * Update Entity References Job Handler
 *
 * Handles the update_entity_references job type — scans wiki markdown files
 * and updates frontmatter entity_id references after an entity merge.
 * Runs as a background job so the merge API returns quickly.
 */

import { getDb } from "@/lib/db";
import { updateJobProgress, markJobCompleted } from "./queue";
import { queueJob } from "@/lib/job-processor";
import type { JobPayload, JobResult } from "./types";
import fs from "fs";
import path from "path";
import { APP_CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateWikiFrontmatter(filePath: string, oldId: string, newId: string): boolean {
  try {
    let content = fs.readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fmMatch) return false;

    const fm = fmMatch[1];
    if (!fm.includes(oldId)) return false;

    const updated = fm.replace(
      new RegExp(`entity_id:\\s*${escapeRegex(oldId)}`, "g"),
      `entity_id: ${newId}`
    );
    if (updated === fm) return false;

    content = content.replace(fmMatch[1], updated);
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

function findWikiFilesWithEntityId(userId: string, entityId: string): string[] {
  const results: string[] = [];
  const wikiRoot = path.join(APP_CONFIG.dataDir, userId, "wiki");
  if (!fs.existsSync(wikiRoot)) return results;

  const walkDir = (dir: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walkDir(fullPath);
        else if (entry.name.endsWith(".md")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes(entityId)) results.push(fullPath);
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  };
  walkDir(wikiRoot);
  return results;
}

export async function process(job: { payload: string; id: string }): Promise<JobResult> {
  const payload: JobPayload = JSON.parse(job.payload);
  const { sourceId, targetId, userId } = payload;

  if (!sourceId || !targetId || !userId) {
    throw new Error("Missing required fields: sourceId, targetId, userId");
  }

  updateJobProgress(job.id, 20, "Scanning wiki files...");

  // Find and update wiki files
  const wikiFiles = findWikiFilesWithEntityId(userId as string, sourceId as string);
  let wikiUpdated = 0;
  for (const filePath of wikiFiles) {
    if (updateWikiFrontmatter(filePath, sourceId as string, targetId as string)) {
      wikiUpdated++;
    }
  }

  updateJobProgress(job.id, 60, `Updated ${wikiUpdated} wiki files`);

  // Update NPC supplementary name references (entity_id already updated by merge)
  const db = getDb();
  const sourceType = (sourceId as string).split(":")[0];
  let npcUpdated = 0;
  let personaUpdated = 0;

  if (sourceType === "npc") {
    const result = db.prepare("UPDATE npcs SET entity_id = ? WHERE entity_id = ?").run(targetId, sourceId);
    npcUpdated = result.changes;
  } else if (sourceType === "persona") {
    const result = db.prepare("UPDATE personas SET entity_id = ? WHERE entity_id = ?").run(targetId, sourceId);
    personaUpdated = result.changes;
  }

  updateJobProgress(job.id, 90, "Finalizing...");

  // Queue re-indexing if wiki files were updated
  if (wikiUpdated > 0) {
    queueJob(userId as string, "universe_wiki_sync", {
      userId,
    }, "low");
  }

  markJobCompleted(job.id);

  return {
    success: true,
    jobId: job.id,
    type: "update_entity_references",
    data: { wikiFilesUpdated: wikiUpdated, npcUpdated, personaUpdated },
  };
}
