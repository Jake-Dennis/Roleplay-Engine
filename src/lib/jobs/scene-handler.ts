/**
 * Scene State Extraction Job Handler
 *
 * Handles the scene_state_extract job type — deferred scene state
 * extraction that previously ran inline during generation, blocking
 * the SSE stream from closing.
 *
 * Also updates session-level narrative state fields (narrative_tension,
 * pacing, narrative_phase, active_goals, active_conflicts) inside
 * extractAndApplySceneState() for atomicity.
 */

import { extractAndApplySceneState, detectAndRecordDecisionPoints } from "@/lib/scene-extraction";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";

/**
 * Handle scene state extraction as a queued job.
 *
 * Calls extractAndApplySceneState() and emits SCENE_UPDATED
 * so the UI still receives real-time updates.
 *
 * Also runs decision point detection as post-processing (Task 34).
 */
export async function handleSceneStateExtract(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  updateJobProgress(jobId, 30, "Extracting scene state...");
  await extractAndApplySceneState(sessionId as string, userId as string);
  updateJobProgress(jobId, 60, "Scene state extracted");

  // Detect and record decision points from recent messages (Task 34)
  detectAndRecordDecisionPoints(sessionId as string, userId as string);
  updateJobProgress(jobId, 80, "Decision points analyzed");

  // Emit SSE event for real-time UI update
  eventBus.emit(`${SessionEvents.SCENE_UPDATED}:${sessionId}`, { sessionId });

  markJobCompleted(jobId);
  return { success: true, jobId, type: "scene_state_extract", data: {} };
}
