import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { withErrorHandler } from "@/lib/with-error-handler";
import { badRequestError } from "@/lib/error-response";
import { getServerConfig } from "@/lib/server-config";
import { logger } from "@/lib/logger";
import { runRoleplayTest } from "@/lib/benchmark/roleplay-test";
import { RoleplayTestResult } from "@/lib/benchmark/types";

// In-memory store for running/completed roleplay tests
const testStore = new Map<string, {
  status: "running" | "completed" | "failed";
  progress: number;
  message: string;
  result?: RoleplayTestResult;
  error?: string;
  createdAt: string;
}>();

function generateTestId(): string {
  return `roleplay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * POST /api/benchmark/roleplay
 * Start a standalone roleplay lore fidelity test.
 * Body: { model?: string, maxContextSize?: number, thinkingMode?: boolean }
 * Returns: { testId: string }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const body = await request.json().catch(() => ({}));
  const serverConfig = getServerConfig();

  const model = body.model || serverConfig.ollama.model;
  const maxContextSize = body.maxContextSize ? Number(body.maxContextSize) : undefined;
  const thinkingMode = body.thinkingMode;

  if (typeof body.maxContextSize !== "undefined" && (typeof body.maxContextSize !== "number" || body.maxContextSize <= 0)) {
    return badRequestError("maxContextSize must be a positive number");
  }

  const testId = generateTestId();

  testStore.set(testId, {
    status: "running",
    progress: 0,
    message: "Starting roleplay lore test...",
    createdAt: new Date().toISOString(),
  });

  // Fire and forget — run the test
  runRoleplayTestInBackground(testId, model, serverConfig.ollama.baseUrl, maxContextSize, thinkingMode).catch((err) => {
    logger.error("[roleplay-benchmark] Test crashed", { testId, error: String(err) });
    const entry = testStore.get(testId);
    if (entry) {
      entry.status = "failed";
      entry.error = String(err);
    }
  });

  return NextResponse.json({ testId }, { status: 202 });
});

async function runRoleplayTestInBackground(
  testId: string,
  model: string,
  ollamaHost: string,
  maxContextSize?: number,
  thinkingMode?: boolean
): Promise<void> {
  try {
    const entry = testStore.get(testId);
    if (!entry) return;

    entry.progress = 10;
    entry.message = "Running roleplay scenarios...";

    // Determine context size: use explicit override, or fetch from user settings
    let contextSize = maxContextSize || 32768;

    const config = {
      model,
      ollamaHost,
      testContextSizes: [1024],
      quickMode: true,
      thinkingMode,
      maxContextSize: contextSize,
    };

    const result = await runRoleplayTest(config, contextSize);

    const completed = testStore.get(testId);
    if (completed) {
      completed.status = "completed";
      completed.progress = 100;
      completed.message = "Roleplay lore test complete!";
      completed.result = result;
    }

    logger.info("[roleplay-benchmark] Test complete", { testId, overallScore: result.overallScore });
  } catch (error) {
    const failed = testStore.get(testId);
    if (failed) {
      failed.status = "failed";
      failed.error = String(error);
    }
    logger.error("[roleplay-benchmark] Test failed", { testId, error: String(error) });
  }
}

/**
 * GET /api/benchmark/roleplay?testId=xxx
 * Poll the status/results of a roleplay lore test.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;

  const url = new URL(request.url);
  const testId = url.searchParams.get("testId");

  if (!testId) {
    return badRequestError("testId query parameter is required");
  }

  const entry = testStore.get(testId);
  if (!entry) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  return NextResponse.json({
    testId,
    status: entry.status,
    progress: entry.progress,
    message: entry.message,
    result: entry.result,
    error: entry.error,
    createdAt: entry.createdAt,
  });
});
