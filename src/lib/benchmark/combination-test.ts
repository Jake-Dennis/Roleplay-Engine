import { BenchmarkConfig, CombinationResult, ContextTestResult } from "./types";
import { generateText } from "../ollama";
import { logger } from "../logger";

const TEST_PROMPT = "Write a short story about a robot learning to paint.";

/** Default upper bound for predict token search in combination tests. */
const DEFAULT_MAX_PREDICT = 32768;

/** Maximum number of context sizes to test in the combination grid. */
const MAX_COMBINATION_SIZES = 5;

function isOomError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("out of memory") ||
    message.includes("oom") ||
    message.includes("cuda out of memory") ||
    message.includes("allocation failed") ||
    message.includes("out of VRAM")
  );
}

function isTimeoutError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("aborted due to timeout") ||
    error.name === "TimeoutError" ||
    error.name === "AbortError"
  );
}

async function attemptCombination(
  model: string,
  ollamaHost: string,
  numCtx: number,
  numPredict: number,
  think?: boolean
): Promise<{ success: boolean; error?: string; isOom: boolean; isTimeout: boolean }> {
  try {
    const response = await generateText(TEST_PROMPT, {
      model,
      num_ctx: numCtx,
      num_predict: numPredict,
      ollamaHost,
      ...(think !== undefined ? { think } : {}),
    });
    const success = response.trim().length > 0;
    return { success, isOom: false, isTimeout: false, error: success ? undefined : "Empty response" };
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

/**
 * Find the max num_predict for a specific context size using binary search.
 */
async function binarySearchPredictForContext(
  model: string,
  ollamaHost: string,
  numCtx: number,
  maxPredict: number,
  think?: boolean
): Promise<{
  maxNumPredict: number;
  resultSizes: { size: number; success: boolean; error?: string }[];
}> {
  const ladder: number[] = [];
  let s = 256;
  while (s <= maxPredict) {
    ladder.push(s);
    s *= 2;
  }

  const resultSizes: { size: number; success: boolean; error?: string }[] = [];
  let low = 0;
  let high = ladder.length - 1;
  let maxWorking = 0;
  let lastAttemptWasRetry = false;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const size = ladder[mid];

    let result = await attemptCombination(model, ollamaHost, numCtx, size, think);

    if (!result.success && !result.isOom && !result.isTimeout && !lastAttemptWasRetry) {
      await new Promise((r) => setTimeout(r, 1000));
      lastAttemptWasRetry = true;
      result = await attemptCombination(model, ollamaHost, numCtx, size, think);
    } else {
      lastAttemptWasRetry = false;
    }

    resultSizes.push({ size, success: result.success, error: result.error });

    if (result.success) {
      maxWorking = Math.max(maxWorking, size);
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return { maxNumPredict: maxWorking, resultSizes };
}

export type CombinationTestProgressCallback = (
  info: {
    contextSize: number;
    maxNumPredict: number;
    index: number;
    total: number;
    success: boolean;
  }
) => void;

/**
 * For each working context size, binary search to find the max num_predict
 * that works together. Produces a 2D curve of viable (ctx, predict) pairs.
 */
export async function runCombinationTests(
  config: BenchmarkConfig,
  contextTest: ContextTestResult,
  onTestProgress?: CombinationTestProgressCallback
): Promise<CombinationResult[]> {
  const startTime = Date.now();
  const { model, ollamaHost, thinkingMode } = config;
  const maxPredict = config.maxPredictTokens ?? DEFAULT_MAX_PREDICT;

  // Select working context sizes from the context test
  const workingSizes = contextTest.testedSizes
    .filter((t) => t.success)
    .map((t) => t.size)
    .sort((a, b) => a - b);

  // Pick representative sizes: spread across the range, limited to MAX_COMBINATION_SIZES
  let selectedSizes: number[];
  if (workingSizes.length <= MAX_COMBINATION_SIZES) {
    selectedSizes = workingSizes;
  } else {
    // Pick evenly spaced sizes across the range
    const step = Math.floor(workingSizes.length / MAX_COMBINATION_SIZES);
    selectedSizes = [];
    for (let i = 0; i < MAX_COMBINATION_SIZES; i++) {
      selectedSizes.push(workingSizes[Math.min(i * step, workingSizes.length - 1)]);
    }
    // Make sure max working context is always included
    const maxCtx = workingSizes[workingSizes.length - 1];
    if (!selectedSizes.includes(maxCtx)) {
      selectedSizes[selectedSizes.length - 1] = maxCtx;
    }
  }

  logger.info("[combination-test] Testing combinations", {
    model,
    contextSizes: selectedSizes,
    maxPredict,
  });

  const results: CombinationResult[] = [];
  let completed = 0;
  const total = selectedSizes.length;

  for (const ctxSize of selectedSizes) {
    const { maxNumPredict, resultSizes } = await binarySearchPredictForContext(
      model,
      ollamaHost,
      ctxSize,
      maxPredict,
      thinkingMode
    );

    const combinationResult: CombinationResult = {
      contextSize: ctxSize,
      maxNumPredict,
      success: maxNumPredict > 0,
      resultPredictSizes: resultSizes,
      durationMs: Date.now() - startTime,
    };
    results.push(combinationResult);
    completed++;

    if (onTestProgress) {
      onTestProgress({
        contextSize: ctxSize,
        maxNumPredict,
        index: completed,
        total,
        success: maxNumPredict > 0,
      });
    }

    logger.info("[combination-test] Result", {
      ctx: ctxSize,
      maxPredict: maxNumPredict,
      success: maxNumPredict > 0,
    });
  }

  return results;
}
