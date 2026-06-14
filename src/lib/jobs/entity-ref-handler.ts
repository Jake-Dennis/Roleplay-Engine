/**
 * Update Entity References Job Handler
 *
 * Handles the update_entity_references job type — after an entity merge:
 * 1. Merges wiki page content (source → target) using the LLM
 * 2. Deletes the source wiki page
 * 3. Updates any other wiki frontmatter entity_id references
 * Runs as a background job so the merge API returns quickly.
 */

import { getDb } from "@/lib/db";
import { updateJobProgress, markJobCompleted } from "./queue";
import { queueJob } from "@/lib/job-processor";
import { generateText } from "@/lib/ollama";
import { readWikiPage, writeWikiPage, listWikiPages } from "@/lib/wiki/file-io";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { createSnapshotFile, getNextVersionNumber, recordVersion } from "@/lib/wiki/history";
import type { JobPayload, JobResult } from "./types";
import fs from "fs";
import path from "path";
import { APP_CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";

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

  updateJobProgress(job.id, 10, "Finding wiki pages...");

  // Find source and target wiki pages
  const wikiRoot = getWikiRoot(userId as string);
  const allPages = listWikiPages(wikiRoot);
  const sourcePage = allPages.find(p => p.frontmatter.entity_id === sourceId);
  const targetPage = allPages.find(p => p.frontmatter.entity_id === targetId);

  // ── Merge wiki page content ──────────────────────────────────────────
  if (sourcePage && targetPage) {
    updateJobProgress(job.id, 30, "Merging wiki content...");

    // Save pre-merge versions for undo
    try {
      const uid = userId as string;
      const srcSlug = sourcePage.path.replace(wikiRoot, "").replace(/\\/g, "/").split("/").filter(Boolean);
      const tgtSlug = targetPage.path.replace(wikiRoot, "").replace(/\\/g, "/").split("/").filter(Boolean);

      const srcSnapshot = createSnapshotFile(wikiRoot, srcSlug, sourcePage.content);
      const srcVersion = getNextVersionNumber(sourcePage.path, uid);
      recordVersion(sourcePage.path, uid, srcVersion, "Pre-merge backup (source)", srcSnapshot);

      const tgtSnapshot = createSnapshotFile(wikiRoot, tgtSlug, targetPage.content);
      const tgtVersion = getNextVersionNumber(targetPage.path, uid);
      recordVersion(targetPage.path, uid, tgtVersion, "Pre-merge backup (target)", tgtSnapshot);
    } catch { /* non-fatal — versioning is bonus */ }

    try {
      const prompt = `You are merging two wiki pages about the same subject into one cohesive page. Keep the best information from both sources, remove duplicates, and write naturally.

Source page (to be merged FROM):
Title: ${sourcePage.frontmatter.title}
Content:
${sourcePage.content.substring(0, 2000)}

Target page (to be merged INTO):
Title: ${targetPage.frontmatter.title}
Content:
${targetPage.content.substring(0, 2000)}

Write only the merged markdown content for the target page. Do not include frontmatter or explanatory text.`;

      const mergedContent = await generateText(prompt, {
        temperature: 0.3,
        userId: userId as string,
      }, 30000);

      // Write merged content to target page (preserve original frontmatter)
      writeWikiPage(targetPage.path, mergedContent.trim(), targetPage.frontmatter);
      logger.info(`[merge] Merged wiki content: ${sourcePage.path} → ${targetPage.path}`);

      // Delete source wiki page
      try {
        fs.unlinkSync(sourcePage.path);
        logger.info(`[merge] Deleted source wiki page: ${sourcePage.path}`);
      } catch (err) {
        logger.warn(`[merge] Failed to delete source wiki page: ${sourcePage.path}`, err);
      }
    } catch (err) {
      // LLM merge failed — append content as fallback
      logger.warn("[merge] LLM merge failed, using append fallback", err);
      try {
        const appended = `${targetPage.content}\n\n---\n\n${sourcePage.content}`;
        writeWikiPage(targetPage.path, appended, targetPage.frontmatter);
        fs.unlinkSync(sourcePage.path);
      } catch (fallbackErr) {
        logger.error("[merge] Fallback merge also failed", fallbackErr);
      }
    }
  }

  // ── Update other wiki files referencing the old entity_id ────────────
  updateJobProgress(job.id, 60, "Updating wiki references...");
  const wikiFiles = findWikiFilesWithEntityId(userId as string, sourceId as string);
  let wikiUpdated = 0;
  const srcId = sourceId as string;
  const tgtId = targetId as string;
  for (const filePath of wikiFiles) {
    try {
      const rawContent = fs.readFileSync(filePath, "utf-8");
      const updated = (rawContent as string).replace(
        new RegExp(`entity_id:\\s*${srcId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"),
        `entity_id: ${tgtId}`
      );
      if (updated !== rawContent) {
        fs.writeFileSync(filePath, updated, "utf-8");
        wikiUpdated++;
      }
    } catch { /* skip */ }
  }
  const db = getDb();
  if (srcId.startsWith("npc:")) {
    db.prepare("UPDATE npcs SET entity_id = ? WHERE entity_id = ?").run(tgtId, srcId);
  } else if (srcId.startsWith("persona:")) {
    db.prepare("UPDATE personas SET entity_id = ? WHERE entity_id = ?").run(tgtId, srcId);
  }

  updateJobProgress(job.id, 80, `Updated ${wikiUpdated} wiki references`);

  updateJobProgress(job.id, 90, "Finalizing...");

  // Queue re-indexing
  if (wikiUpdated > 0) {
    queueJob(userId as string, "universe_wiki_sync", { userId }, "low");
  }

  markJobCompleted(job.id);

  return {
    success: true,
    jobId: job.id,
    type: "update_entity_references",
    data: { wikiFilesUpdated: wikiUpdated, wikiMerged: sourcePage && targetPage ? true : false },
  };
}
