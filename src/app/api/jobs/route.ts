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
import { badRequestError } from "@/lib/error-response";

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

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

  const body = await request.json();
  const { action, type, payload, priority, jobId, universe_id } = body;

  switch (action) {
    case "queue": {
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
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: message, queuedCount: 0 });
      }
    }

    case "process-idle": {
      const result = await processIdleTime(userId, universe_id || null);
      return NextResponse.json({ success: true, ...result });
    }

    default:
      return badRequestError("Invalid action");
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const url = new URL(request.url);
  const jobId = url.searchParams.get("id");

  if (jobId) {
    const cancelled = cancelJob(jobId);
    return NextResponse.json({ success: cancelled });
  }

  const count = cancelAllUserJobs(userId);
  return NextResponse.json({ success: true, cancelledCount: count });
}
