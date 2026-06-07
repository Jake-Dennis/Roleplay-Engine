import { BenchmarkConfig, PredictTestResult } from "./types";
import { generateText } from "../ollama";
import { logger } from "../logger";

/**
 * Context size used for the predict token test. We keep this small so the
 * test measures pure output capacity without being bottlenecked by input
 * context VRAM.
 */
const FIXED_NUM_CTX = 2048;

const TEST_PROMPT = "Write a detailed story about a space explorer.";

/** Default upper bound for predict tokens test. 32K covers most models. */
const DEFAULT_MAX_PREDICT = 32768;

/**
 * Detect if an error indicates out-of-memory condition.
 */
function isOomError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("out of memory") ||
    message.includes("oom") ||
    message.includes("cuda out of memory") ||
    message.includes("allocation failed") ||
    message.includes("out of VRAM") ||
    message.includes("out of vram")
  );
}

/**
 * Detect if an error indicates a timeout (used as a soft OOM signal).
 */
function isTimeoutError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("aborted due to timeout") ||
    message.includes("operation was aborted") ||
    error.name === "TimeoutError" ||
    error.name === "AbortError"
  );
}

/**
 * Attempt generation with the given num_predict at a small fixed context size.
 */
async function attemptPredictGeneration(
  model: string,
  ollamaHost: string,
  numPredict: number,
  think?: boolean
): Promise<{ success: boolean; error?: string; isOom: boolean; isTimeout: boolean }> {
  try {
    const response = await generateText(TEST_PROMPT, {
      model,
      num_ctx: FIXED_NUM_CTX,
      num_predict: numPredict,
      ollamaHost,
      ...(think !== undefined ? { think } : {}),
    });

    // Success if we got a non-empty response
    const success = response.trim().length > 0;
    return {
      success,
      isOom: false,
      isTimeout: false,
      error: success ? undefined : "Empty response",
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      success: false,
      error: error.message,
      isOom: isOomError(error),
      isTimeout: isTimeoutError(error),
    };
  }
}

export type PredictTestProgressCallback = (
  info: { size: number; index: number; total: number; success: boolean; error?: string }
) => void;

/**
 * Binary search for the maximum num_predict that works at a fixed small context.
 */
export async function runPredictTest(
  config: BenchmarkConfig,
  onTestProgress?: PredictTestProgressCallback
): Promise<PredictTestResult> {
  const startTime = Date.now();
  const { model, ollamaHost, thinkingMode } = config;
  const maxPredict = config.maxPredictTokens ?? DEFAULT_MAX_PREDICT;

  // Build a power-of-2 ladder for predict sizes
  const ladder: number[] = [];
  let s = 256;
  while (s <= maxPredict) {
    ladder.push(s);
    s *= 2;
  }
  const sizesToTest = ladder;

  logger.info("[predict-test] Starting max predict token binary search", {
    model,
    ollamaHost,
    sizes: sizesToTest,
    maxPredict,
  });

  const testedSizes: PredictTestResult["testedSizes"] = [];
  let maxWorkingSize = 0;
  let oomSize: number | undefined;
  let low = 0;
  let high = sizesToTest.length - 1;
  let lastAttemptWasRetry = false;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const size = sizesToTest[mid];

    let result = await attemptPredictGeneration(model, ollamaHost, size, thinkingMode);

    // Retry once on non-fatal errors
    if (!result.success && !result.isOom && !result.isTimeout && !lastAttemptWasRetry) {
      await new Promise((r) => setTimeout(r, 1000));
      lastAttemptWasRetry = true;
      result = await attemptPredictGeneration(model, ollamaHost, size, thinkingMode);
    } else {
      lastAttemptWasRetry = false;
    }

    testedSizes.push({ size, success: result.success, error: result.error });

    if (onTestProgress) {
      onTestProgress({
        size,
        index: testedSizes.length,
        total: sizesToTest.length,
        success: result.success,
        error: result.error,
      });
    }

    if (result.success) {
      maxWorkingSize = Math.max(maxWorkingSize, size);
      low = mid + 1;
    } else {
      if (result.isOom || result.isTimeout) {
        oomSize = size;
      }
      high = mid - 1;
    }
  }

  const durationMs = Date.now() - startTime;
  const success = maxWorkingSize > 0;

  logger.info("[predict-test] Predict test complete", {
    success,
    maxPredictFound: maxWorkingSize,
    oomSize,
    testedCount: testedSizes.length,
    durationMs,
  });

  return { success, maxPredictFound: maxWorkingSize, testedSizes, oomSize, durationMs };
}
