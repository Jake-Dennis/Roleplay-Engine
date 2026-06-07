import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { withErrorHandler } from "@/lib/with-error-handler";
import { badRequestError, notFoundError } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";
import { getServerConfig, updateServerConfig } from "@/lib/server-config";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  BenchmarkConfig,
  BenchmarkReport,
} from "@/lib/benchmark/types";
import {
  generateJobId,
  createJob,
  getJob,
  getUserJobs,
  updateJob,
  persistJob,
  loadUserJobs,
} from "@/lib/benchmark/job-store";
import { runBenchmarkBackground } from "@/lib/benchmark/orchestrator";
import { BenchmarkProgress } from "@/lib/benchmark/orchestrator";

interface StartBenchmarkRequest {
  model?: string;
  quickMode?: boolean;
  testContextSizes?: number[];
  thinkingMode?: boolean;
  maxContextSize?: number;
  maxPredictTokens?: number;
}

interface BenchmarkJobResponse {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  stage?: string;
  currentTest?: string;
  stageProgress?: { current: number; total: number };
  config: BenchmarkConfig;
  report?: BenchmarkReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

const DEFAULT_TEST_CONTEXT_SIZES = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];
const QUICK_TEST_CONTEXT_SIZES = [2048, 4096, 8192, 16384, 32768];

function buildBenchmarkConfig(
  request: StartBenchmarkRequest,
  userId: string,
  serverConfig: ReturnType<typeof getServerConfig>
): BenchmarkConfig {
  return {
    model: request.model || serverConfig.ollama.model,
    ollamaHost: serverConfig.ollama.baseUrl,
    testContextSizes: request.testContextSizes || (request.quickMode ? QUICK_TEST_CONTEXT_SIZES : DEFAULT_TEST_CONTEXT_SIZES),
    quickMode: request.quickMode ?? false,
    thinkingMode: request.thinkingMode,
    maxContextSize: request.maxContextSize,
    maxPredictTokens: request.maxPredictTokens,
  };
}

async function startBenchmarkBackground(jobId: string, userId: string): Promise<void> {
  let job = getJob(jobId);
  if (!job) {
    logger.error("[benchmark] Job not found for background execution", { jobId });
    return;
  }

  // Update to running
  updateJob(jobId, { status: "running", progress: 0, stage: "init", message: "Starting...", startedAt: new Date().toISOString() });
  await persistJob({ ...job, status: "running", progress: 0, stage: "init", message: "Starting...", startedAt: new Date().toISOString() });

  try {
    const report = await runBenchmarkBackground(job.config, userId, (progress: BenchmarkProgress) => {
      updateJob(jobId, {
        progress: progress.progress,
        message: progress.message,
        stage: progress.stage,
        currentTest: progress.currentTest,
        stageProgress: progress.stageProgress,
        updatedAt: new Date().toISOString(),
      });
    });

    // Mark completed
    const completedAt = new Date().toISOString();
    updateJob(jobId, {
      status: "completed",
      progress: 100,
      message: "Completed",
      report,
      completedAt,
      updatedAt: completedAt,
    });
    await persistJob(getJob(jobId)!);

    logger.info("[benchmark] Benchmark completed", { jobId, userId, model: report.config.model });

    // Auto-apply recommendations to the per-model settings for the
    // model that was just benchmarked. We only do this when the user
    // has NOT already set a per-model override for this model — we
    // never want to silently clobber a hand-tuned value. If a manual
    // override exists, the "Apply" button on the settings page is
    // still available for the user to push the new recommendation.
    try {
      const model = report.config.model;
      const { recommendedNumCtx, recommendedNumPredict } = report;
      if (model && recommendedNumCtx && recommendedNumPredict) {
        const cfg = getServerConfig();
        const existing = cfg.modelDefaults?.[model];
        if (!existing) {
          updateServerConfig({
            model_defaults: {
              ...(cfg.modelDefaults ?? {}),
              [model]: { numCtx: recommendedNumCtx, numPredict: recommendedNumPredict },
            },
          });
          logger.info("[benchmark] Auto-applied recommendations to per-model settings", {
            jobId, model, recommendedNumCtx, recommendedNumPredict,
          });
        } else {
          logger.info("[benchmark] Skipped auto-apply — model already has per-model overrides", {
            jobId, model,
          });
        }
      }
    } catch (autoApplyError) {
      logger.error("[benchmark] Auto-apply failed (non-fatal)", {
        jobId, error: (autoApplyError as Error).message,
      });
    }
  } catch (error: unknown) {
    const err = error as Error;
    // job might be undefined if getJob fails, so use the original jobId
    const errorMessage = err.message;

    logger.error("[benchmark] Benchmark failed", { jobId, userId, error: errorMessage });

    const failedAt = new Date().toISOString();
    // Refresh job reference in case it was garbage collected
    job = getJob(jobId);
    if (job) {
      updateJob(jobId, { 
        status: "failed", 
        progress: 100, 
        message: "Failed", 
        error: errorMessage,
        completedAt: failedAt,
        updatedAt: failedAt,
      });
      await persistJob(getJob(jobId)!);
    }
  }
}

/**
 * POST /api/benchmark
 * Start a new benchmark job.
 * Body: { model?: string, quickMode?: boolean, testContextSizes?: number[] }
 * Returns: { jobId, status: "started" }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`benchmark_start:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const body = await request.json() as StartBenchmarkRequest;

  // Validate quickMode
  if (body.quickMode !== undefined && typeof body.quickMode !== "boolean") {
    return badRequestError("quickMode must be a boolean");
  }

  // Validate thinkingMode
  if (body.thinkingMode !== undefined && typeof body.thinkingMode !== "boolean") {
    return badRequestError("thinkingMode must be a boolean");
  }

  // Validate maxContextSize
  if (body.maxContextSize !== undefined) {
    if (typeof body.maxContextSize !== "number" || body.maxContextSize <= 0) {
      return badRequestError("maxContextSize must be a positive number");
    }
    if (body.maxContextSize > 1048576) {
      return badRequestError("maxContextSize cannot exceed 1048576 (1M tokens)");
    }
  }

  // Validate testContextSizes
  if (body.testContextSizes !== undefined) {
    if (!Array.isArray(body.testContextSizes) || body.testContextSizes.length === 0) {
      return badRequestError("testContextSizes must be a non-empty array");
    }
    if (!body.testContextSizes.every(s => typeof s === "number" && s > 0)) {
      return badRequestError("testContextSizes must contain positive numbers");
    }
  }

  // Verify user exists
  const user = getDb().prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) {
    return notFoundError("User");
  }

  // Build config
  const serverConfig = getServerConfig();
  const config = buildBenchmarkConfig(body, userId, serverConfig);

  // Create job
  const job = createJob(userId, config);

  // Persist initial job state
  await persistJob(job);

  // Start benchmark in background (fire-and-forget)
  startBenchmarkBackground(job.jobId, userId).catch((err) => {
    logger.error("[benchmark] Background benchmark crashed", { jobId: job.jobId, error: String(err) });
  });

  return NextResponse.json({ jobId: job.jobId, status: "started" }, { status: 202 });
});

/**
 * GET /api/benchmark
 * List user's benchmark jobs.
 * Query: ?model=xxx&limit=10
 * Returns: { benchmarks: BenchmarkJob[] } (latest first)
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`benchmark_list:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  // Ensure jobs are loaded from disk
  await loadUserJobs(userId);

  const url = new URL(request.url);
  const modelFilter = url.searchParams.get("model") || undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

  let jobs = getUserJobs(userId);

  if (modelFilter) {
    jobs = jobs.filter(job => job.config.model === modelFilter);
  }

  jobs = jobs.slice(0, limit);

  // Convert to response format
  const benchmarks: BenchmarkJobResponse[] = jobs.map(job => ({
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
  }));

  return NextResponse.json({ benchmarks });
});