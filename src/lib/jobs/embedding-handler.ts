/**
 * Embedding Generation Job Handler
 *
 * Handles the generate_embeddings job type — creates vector embeddings
 * for entities (messages, locations, NPCs, events).
 */

import { processEmbeddings } from "@/lib/embeddings";
import { updateJobProgress, markJobCompleted } from "./queue";
import type { JobPayload, JobResult } from "./types";

/**
 * Handle embedding generation for a given entity.
 */
export async function handleGenerateEmbeddings(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { entityType, entityId, userId, content } = payload;
  if (!entityType || !entityId || !userId) {
    throw new Error("Missing entityType, entityId, or userId");
  }

  updateJobProgress(jobId, 30, "Generating embedding...");
  const result = await processEmbeddings(
    userId as string,
    entityType as string,
    entityId as string,
    content as string | undefined
  );
  updateJobProgress(jobId, 85, "Storing embedding...");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "generate_embeddings",
    data: { embeddingId: result.embeddingId },
  };
}
