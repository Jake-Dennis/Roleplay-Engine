import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import {
  queueJob,
  getUserJobs,
  getJobStats,
  cancelJob,
  cancelAllUserJobs,
  processJob,
  processUserJobs,
  getNextJob,
  type JobType,
  type JobPriority,
  type JobStatus,
} from "@/lib/job-processor";
import { queueIdleJobs, processIdleTime, shouldProcessIdleTime } from "@/lib/idle-processing";
import { badRequestError, requireJson } from "@/lib/error-response";
import { logger } from "@/lib/logger";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const type = url.searchParams.get("type") || undefined;
  const universeId = url.searchParams.get("universe_id") || undefined;

  if (type) {
    // Get stats for a specific job type
    const stats = getJobStats(userId);
    return NextResponse.json({ stats });
  }

  // Get user's jobs
  const jobs = getUserJobs(userId, status as JobStatus | undefined, universeId);
  const stats = getJobStats(userId);

  return NextResponse.json({ jobs, stats });
}

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`jobs_trigger:${ip}`, "jobs_trigger");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { action, type, payload, priority, jobId, universe_id } = body;

  switch (action) {
    case "queue": {
      if (!type) {
        return badRequestError("type is required");
      }
      const validJobTypes: JobType[] = [
        "summarize_messages", "summarize_message",
        "generate_embeddings", "analyze_relationships", "decay_relationships",
        "compress_memories", "refine_relationship_summary", "archival_processing",
        "thread_analysis", "idle_enrichment", "wiki_ingest", "wiki_enrich_entity",
        "wiki_generate_rumors", "wiki_deepen_page", "wiki_deepen_location",
        "wiki_extract_event", "generate_session_recap", "npc_evolution",
        "extract_lore_comprehensive",
      ];
      if (!validJobTypes.includes(type as JobType)) {
        return badRequestError(`Invalid job type. Must be one of: ${validJobTypes.join(", ")}`);
      }
      if (priority) {
        const validPriorities: JobPriority[] = ["high", "medium", "low", "idle"];
        if (!validPriorities.includes(priority as JobPriority)) {
          return badRequestError(`Invalid priority. Must be one of: ${validPriorities.join(", ")}`);
        }
      }

      const id = queueJob(
        userId,
        type as JobType,
        payload || {},
        (priority as JobPriority) || "medium",
        universe_id || payload?.universeId || undefined
      );
      return NextResponse.json({ success: true, jobId: id });
    }

    case "process": {
      // Process all queued jobs for user
      const results = await processUserJobs(userId, 10);
      return NextResponse.json({ success: true, results });
    }

    case "process-next": {
      // Process the next queued job
      const job = getNextJob(userId, type as JobType | undefined, universe_id);
      if (!job) {
        return NextResponse.json({ success: false, message: "No queued jobs" });
      }
      const result = await processJob(job);
      return NextResponse.json({ success: result.success, result });
    }

    case "cancel": {
      if (!jobId) {
        return badRequestError("jobId required");
      }
      const cancelled = cancelJob(jobId);
      return NextResponse.json({ success: cancelled });
    }

    case "cancel-all": {
      const count = cancelAllUserJobs(userId);
      return NextResponse.json({ success: true, cancelledCount: count });
    }

    case "queue-idle": {
      try {
        const count = queueIdleJobs(userId, universe_id || null);
        return NextResponse.json({ success: true, queuedCount: count });
      } catch (e: unknown) {
        logger.error("Failed to queue idle jobs", e);
        return NextResponse.json({ success: false, error: "Internal server error", queuedCount: 0 });
      }
    }

    case "process-idle": {
      // Fire-and-forget: defer idle processing to avoid blocking the response
      setImmediate(async () => {
        try {
          await processIdleTime(userId, universe_id || null);
        } catch (err: unknown) {
          // Log but don't crash — idle processing is best-effort
          logger.error("Idle processing failed", err);
        }
      });
      return NextResponse.json({ success: true, message: "Idle processing started" });
    }

    default:
      return badRequestError("Invalid action");
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const url = new URL(request.url);
  const jobId = url.searchParams.get("id");

  if (jobId) {
    const cancelled = cancelJob(jobId);
    return NextResponse.json({ success: cancelled });
  }

  const count = cancelAllUserJobs(userId);
  return NextResponse.json({ success: true, cancelledCount: count });
}
