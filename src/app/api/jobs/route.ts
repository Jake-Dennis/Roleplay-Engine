import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
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
} from "@/lib/job-processor";
import { queueIdleJobs, processIdleTime, shouldProcessIdleTime } from "@/lib/idle-processing";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const type = url.searchParams.get("type") || undefined;
  const universeId = url.searchParams.get("universe_id") || undefined;

  if (type) {
    // Get stats for a specific job type
    const stats = getJobStats(decoded.sub);
    return NextResponse.json({ stats });
  }

  // Get user's jobs
  const jobs = getUserJobs(decoded.sub, status as any, universeId);
  const stats = getJobStats(decoded.sub);

  return NextResponse.json({ jobs, stats });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { action, type, payload, priority, jobId, universe_id } = body;

  switch (action) {
    case "queue": {
      const id = queueJob(
        decoded.sub,
        type as JobType,
        payload || {},
        (priority as JobPriority) || "medium",
        universe_id || payload?.universeId || undefined
      );
      return NextResponse.json({ success: true, jobId: id });
    }

    case "process": {
      // Process all queued jobs for user
      const results = await processUserJobs(decoded.sub, 10);
      return NextResponse.json({ success: true, results });
    }

    case "process-next": {
      // Process the next queued job
      const job = getNextJob(decoded.sub, type as JobType | undefined, universe_id);
      if (!job) {
        return NextResponse.json({ success: false, message: "No queued jobs" });
      }
      const result = await processJob(job);
      return NextResponse.json({ success: result.success, result });
    }

    case "cancel": {
      if (!jobId) {
        return NextResponse.json({ error: "jobId required" }, { status: 400 });
      }
      const cancelled = cancelJob(jobId);
      return NextResponse.json({ success: cancelled });
    }

    case "cancel-all": {
      const count = cancelAllUserJobs(decoded.sub);
      return NextResponse.json({ success: true, cancelledCount: count });
    }

    case "queue-idle": {
      try {
        const count = queueIdleJobs(decoded.sub, universe_id || null);
        return NextResponse.json({ success: true, queuedCount: count });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message, queuedCount: 0 });
      }
    }

    case "process-idle": {
      const result = await processIdleTime(decoded.sub, universe_id || null);
      return NextResponse.json({ success: true, ...result });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const url = new URL(request.url);
  const jobId = url.searchParams.get("id");

  if (jobId) {
    const cancelled = cancelJob(jobId);
    return NextResponse.json({ success: cancelled });
  }

  const count = cancelAllUserJobs(decoded.sub);
  return NextResponse.json({ success: true, cancelledCount: count });
}
