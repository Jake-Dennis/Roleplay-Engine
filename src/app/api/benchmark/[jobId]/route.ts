import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { withErrorHandler } from "@/lib/with-error-handler";
import { notFoundError, forbiddenError } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import {
  getJob,
  getUserJobs,
  updateJob,
  deleteJob,
  persistJob,
  loadUserJobs,
  deleteJobFile,
} from "@/lib/benchmark/job-store";
import { BenchmarkReport } from "@/lib/benchmark/types";

interface BenchmarkJobResponse {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  stage?: string;
  currentTest?: string;
  stageProgress?: { current: number; total: number };
  config: {
    model: string;
    ollamaHost: string;
    testContextSizes: number[];
    quickMode: boolean;
  };
  report?: BenchmarkReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

function toResponse(job: ReturnType<typeof getJob>): BenchmarkJobResponse | null {
  if (!job) return null;
  return {
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    stage: job.stage,
    currentTest: job.currentTest,
    stageProgress: job.stageProgress,
    config: job.config,
    report: job.report,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

/**
 * GET /api/benchmark/[jobId]
 * Get a specific benchmark job status/result.
 * Returns: { jobId, status, progress, report?, error? }
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`benchmark_get:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { jobId } = await params;

  // Ensure jobs are loaded from disk
  await loadUserJobs(userId);

  const job = getJob(jobId);
  if (!job) {
    return notFoundError("Benchmark job");
  }

  // Verify ownership
  if (job.userId !== userId) {
    return forbiddenError();
  }

  const response = toResponse(job);
  if (!response) {
    return notFoundError("Benchmark job");
  }

  return NextResponse.json(response);
});

/**
 * DELETE /api/benchmark/[jobId]
 * Delete a benchmark job/report.
 * Auth: Verify ownership
 */
export const DELETE = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`benchmark_delete:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { jobId } = await params;

  // Ensure jobs are loaded from disk
  await loadUserJobs(userId);

  const job = getJob(jobId);
  if (!job) {
    return notFoundError("Benchmark job");
  }

  // Verify ownership
  if (job.userId !== userId) {
    return forbiddenError();
  }

  // Delete from memory
  deleteJob(jobId);

  // Delete from disk
  await deleteJobFile(userId, jobId);

  logger.info("[benchmark] Job deleted", { jobId, userId });

  return NextResponse.json({ success: true });
});