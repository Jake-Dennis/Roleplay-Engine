import { BenchmarkConfig, ContextTestResult } from "./types";
import { OllamaModelMeta } from "../ollama-meta";
import { generateText } from "../ollama";
import { logger } from "../logger";

const TEST_PROMPT = "Repeat the word 'test' 10 times.";
const TEST_VALIDATION = /test/i;

/**
 * num_predict used for the context test. We keep this low so the test
 * measures pure context-window capacity without being bottlenecked by
 * output generation VRAM.
 */
const CONTEXT_TEST_NUM_PREDICT = 256;

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
 * Detect if an error indicates context window too large.
 */
function isContextTooLargeError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("context length exceeds") ||
    message.includes("num_ctx too large") ||
    message.includes("context window") ||
    message.includes("exceeds maximum context") ||
    message.includes("context size") ||
    message.includes("max context")
  );
}

/**
 * Detect if an error indicates timeout.
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
 * Attempt a single generation with the given context size and small num_predict.
 */
async function attemptGeneration(
  model: string,
  ollamaHost: string,
  numCtx: number,
  think?: boolean
): Promise<{
  success: boolean;
  error?: string;
  isOom: boolean;
  isContextTooLarge: boolean;
  isTimeout: boolean;
}> {
  try {
    const response = await generateText(TEST_PROMPT, {
      model,
      num_ctx: numCtx,
      num_predict: CONTEXT_TEST_NUM_PREDICT,
      ollamaHost,
      ...(think !== undefined ? { think } : {}),
    });

    if (TEST_VALIDATION.test(response)) {
      return { success: true, isOom: false, isContextTooLarge: false, isTimeout: false };
    }

    return {
      success: false,
      error: "Response validation failed: expected 'test' in output",
      isOom: false,
      isContextTooLarge: false,
      isTimeout: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      success: false,
      error: error.message,
      isOom: isOomError(error),
      isContextTooLarge: isContextTooLargeError(error),
      isTimeout: isTimeoutError(error),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_MAX_CONTEXT_SIZE = 131072;
const EARLY_STOP_CONSECUTIVE_FAILURES = 2;

export type ContextTestProgressCallback = (
  info: { size: number; index: number; total: number; success: boolean; error?: string; isTimeout?: boolean }
) => void;

export async function runContextTest(
  config: BenchmarkConfig,
  modelMeta: OllamaModelMeta,
  onTestProgress?: ContextTestProgressCallback
): Promise<ContextTestResult> {
  const startTime = Date.now();
  const { model, ollamaHost, testContextSizes, quickMode, thinkingMode } = config;
  const userMaxSize = config.maxContextSize ?? DEFAULT_MAX_CONTEXT_SIZE;

  // Build a size ladder from smallest in testContextSizes up to userMaxSize
  const baseSizes = [...testContextSizes].sort((a, b) => a - b);
  const minSize = baseSizes[0] ?? 1024;

  const ladder: number[] = [];
  let s = minSize;
  while (s <= userMaxSize) {
    ladder.push(s);
    s *= 2;
  }
  const sizesToTest = Array.from(new Set([...ladder, ...baseSizes])).sort((a, b) => a - b);

  // Cap to model's context window if known
  if (modelMeta.contextWindow > 0) {
    const maxHint = Math.floor(modelMeta.contextWindow * 1.1);
    if (maxHint < userMaxSize) {
      const filtered = sizesToTest.filter((s) => s <= maxHint);
      sizesToTest.length = 0;
      sizesToTest.push(...filtered);
    }
  }

  if (sizesToTest.length === 0) {
    return {
      success: false,
      maxContextFound: 0,
      testedSizes: [],
      durationMs: Date.now() - startTime,
    };
  }

  logger.info("[context-test] Starting context window binary search (num_predict=256)", {
    model,
    ollamaHost,
    testSizes: sizesToTest,
    userMaxSize,
    quickMode,
  });

  const testedSizes: ContextTestResult["testedSizes"] = [];
  let maxWorkingSize = 0;
  let oomSize: number | undefined;
  let low = 0;
  let high = sizesToTest.length - 1;
  let lastAttemptWasRetry = false;
  let consecutiveFailures = 0;
  let earlyStopped = false;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const size = sizesToTest[mid];

    let result = await attemptGeneration(model, ollamaHost, size, thinkingMode);

    // Retry once on non-fatal errors
    if (!result.success && !result.isOom && !result.isContextTooLarge && !lastAttemptWasRetry) {
      await sleep(1000);
      lastAttemptWasRetry = true;
      result = await attemptGeneration(model, ollamaHost, size, thinkingMode);
    } else {
      lastAttemptWasRetry = false;
    }

    const testedEntry = { size, success: result.success, error: result.error, isTimeout: result.isTimeout };
    testedSizes.push(testedEntry);

    if (onTestProgress) {
      onTestProgress({
        size,
        index: testedSizes.length,
        total: sizesToTest.length,
        success: result.success,
        error: result.error,
        isTimeout: result.isTimeout,
      });
    }

    if (result.success) {
      maxWorkingSize = Math.max(maxWorkingSize, size);
      consecutiveFailures = 0;
      low = mid + 1;
    } else {
      if (result.isOom) oomSize = size;
      if (result.isOom || result.isContextTooLarge || result.isTimeout) {
        high = mid - 1;
      } else {
        high = mid - 1;
      }

      consecutiveFailures++;
      if (consecutiveFailures >= EARLY_STOP_CONSECUTIVE_FAILURES && maxWorkingSize === 0) {
        earlyStopped = true;
        break;
      }
    }
  }

  // If NOT quickMode, verify upward from maxWorkingSize
  if (!quickMode && !earlyStopped && maxWorkingSize > 0) {
    const largerSizes = sizesToTest.filter((s) => s > maxWorkingSize);
    for (const size of largerSizes) {
      if (!testedSizes.some((t) => t.size === size)) {
        const result = await attemptGeneration(model, ollamaHost, size, thinkingMode);
        testedSizes.push({ size, success: result.success, error: result.error, isTimeout: result.isTimeout });
        if (onTestProgress) {
          onTestProgress({
            size,
            index: testedSizes.length,
            total: sizesToTest.length,
            success: result.success,
            error: result.error,
            isTimeout: result.isTimeout,
          });
        }
        if (result.success) {
          maxWorkingSize = size;
        } else if (result.isOom || result.isTimeout) {
          oomSize = size;
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const success = maxWorkingSize > 0;

  logger.info("[context-test] Context test complete", {
    success,
    maxContextFound: maxWorkingSize,
    oomSize,
    testedCount: testedSizes.length,
    durationMs,
  });

  return { success, maxContextFound: maxWorkingSize, testedSizes, oomSize, durationMs };
}
