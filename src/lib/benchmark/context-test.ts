import { BenchmarkConfig, ContextTestResult } from "./types";
import { OllamaModelMeta } from "../ollama-meta";
import { generateText } from "../ollama";
import { logger } from "../logger";

const TEST_PROMPT = "Repeat the word 'test' 10 times.";
const TEST_VALIDATION = /test/i;

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
  * Attempt a single generation with the given context size.
  * Returns { success: true } if generation worked and response contains "test".
  * Returns { success: false, error, isOom, isContextTooLarge, isTimeout } on failure.
  */
async function attemptGeneration(
  model: string,
  ollamaHost: string,
  numCtx: number,
  _timeoutMs: number,
  think?: boolean
): Promise<{
  success: boolean;
  error?: string;
  isOom: boolean;
  isContextTooLarge: boolean;
  isTimeout: boolean;
}> {
  try {
    // No per-request timeout - let generateText handle it
    const response = await generateText(TEST_PROMPT, {
      model,
      num_ctx: numCtx,
      ollamaHost,
      ...(think !== undefined ? { think } : {}),
    });

    // Validate response contains "test"
    if (TEST_VALIDATION.test(response)) {
      return { success: true, isOom: false, isContextTooLarge: false, isTimeout: false };
    }

    // Response didn't contain expected output
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

/**
 * Sleep utility for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default upper bound for context test (in tokens). 128K covers the vast majority
 * of practical use cases and avoids burning time on obviously-impractical sizes.
 * Can be overridden via config.maxContextSize — recommended values:
 *   131072 (128K)  — default, fastest
 *   262144 (256K)  — covers long-doc summarization
 *   524288 (512K)  — book-length contexts
 *   1048576 (1M)   — requires high-VRAM GPU; very slow on CPU
 */
const DEFAULT_MAX_CONTEXT_SIZE = 131072;

/**
 * If the first N consecutive tests all fail, abort early. This protects weak
 * hardware (small RAM, integrated GPU) from spending minutes failing at sizes
 * the user clearly can't run.
 */
const EARLY_STOP_CONSECUTIVE_FAILURES = 2;

/**
 * Callback fired after each individual context size is tested.
 * Used by the orchestrator to update the UI progress bar in real time.
 */
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

  // Build a size ladder from smallest in testContextSizes up to userMaxSize.
  // We don't use the user-supplied list directly — instead we generate a power-of-2
  // ladder from `min(testContextSizes)` to `userMaxSize` so binary search has good
  // coverage. We still respect sizes in testContextSizes as a minimum floor.
  const baseSizes = [...testContextSizes].sort((a, b) => a - b);
  const minSize = baseSizes[0] ?? 1024;

  // Generate power-of-2 ladder
  const ladder: number[] = [];
  let s = minSize;
  while (s <= userMaxSize) {
    ladder.push(s);
    s *= 2;
  }
  // Make sure we have at least the user-specified sizes
  const sizesToTest = Array.from(new Set([...ladder, ...baseSizes])).sort((a, b) => a - b);

  // If modelMeta.contextWindow > 0, use it as a soft upper bound hint
  // Don't test sizes larger than the model's reported context window (with 10% buffer)
  if (modelMeta.contextWindow > 0) {
    const maxHint = Math.floor(modelMeta.contextWindow * 1.1);
    if (maxHint < userMaxSize) {
      const filtered = sizesToTest.filter((s) => s <= maxHint);
      logger.debug("[context-test] Capping tests to model context window", {
        modelContextWindow: modelMeta.contextWindow,
        maxHint,
        beforeCount: sizesToTest.length,
        afterCount: filtered.length,
      });
      sizesToTest.length = 0;
      sizesToTest.push(...filtered);
    }
  }

  if (sizesToTest.length === 0) {
    logger.warn("[context-test] No valid context sizes to test after filtering");
    return {
      success: false,
      maxContextFound: 0,
      testedSizes: [],
      durationMs: Date.now() - startTime,
    };
  }

  logger.info("[context-test] Starting context window binary search", {
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

  // Binary search to find the boundary
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const size = sizesToTest[mid];

    logger.debug("[context-test] Testing context size", { size, index: mid, low, high });

    // Attempt generation
    let result = await attemptGeneration(model, ollamaHost, size, 0, thinkingMode);

    // Retry once on non-OOM, non-context-too-large errors
    if (!result.success && !result.isOom && !result.isContextTooLarge && !lastAttemptWasRetry) {
      logger.debug("[context-test] Retrying after non-fatal error", { size, error: result.error });
      await sleep(1000);
      lastAttemptWasRetry = true;
      result = await attemptGeneration(model, ollamaHost, size, 0, thinkingMode);
    } else {
      lastAttemptWasRetry = false;
    }

    const testedEntry = {
      size,
      success: result.success,
      error: result.error,
      isTimeout: result.isTimeout,
    };
    testedSizes.push(testedEntry);

    // Emit per-test progress to the orchestrator
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
      logger.info("[context-test] Context size succeeded", { size });
      maxWorkingSize = Math.max(maxWorkingSize, size);
      consecutiveFailures = 0;
      low = mid + 1; // Try larger
    } else {
      logger.info("[context-test] Context size failed", { size, error: result.error, isOom: result.isOom, isContextTooLarge: result.isContextTooLarge, isTimeout: result.isTimeout });

      if (result.isOom) {
        oomSize = size;
      }

      // Treat timeout as definitive failure (like OOM) - try smaller
      if (result.isOom || result.isContextTooLarge || result.isTimeout) {
        high = mid - 1;
      } else {
        // Transient error — treat as failure but don't assume boundary
        high = mid - 1;
      }

      consecutiveFailures++;
      if (consecutiveFailures >= EARLY_STOP_CONSECUTIVE_FAILURES && maxWorkingSize === 0) {
        // The smallest N sizes all failed — hardware clearly can't run this model.
        // Abort instead of wasting time on every size in the ladder.
        logger.warn("[context-test] Early stop — consecutive failures with no successes", {
          consecutiveFailures,
          smallestTested: sizesToTest[0],
        });
        earlyStopped = true;
        break;
      }

      if (result.isOom || result.isContextTooLarge) {
        // Definitive failure — try smaller
        high = mid - 1;
      } else {
        // Transient error — treat as failure but don't assume boundary
        // Try smaller to be safe
        high = mid - 1;
      }
    }
  }

  // If NOT quickMode, do a linear verification pass upward from maxWorkingSize
  // to ensure we found the true maximum within the tested sizes
  if (!quickMode && !earlyStopped && maxWorkingSize > 0) {
    const largerSizes = sizesToTest.filter((s) => s > maxWorkingSize);
    for (const size of largerSizes) {
      // Only test if we haven't already tested this size
      if (!testedSizes.some((t) => t.size === size)) {
        logger.debug("[context-test] Quick verification of larger size", { size });
        const result = await attemptGeneration(model, ollamaHost, size, 0, thinkingMode);
        testedSizes.push({ size, success: result.success, error: result.error, isTimeout: result.isTimeout });
        // Emit per-test progress for the verification pass
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
          logger.info("[context-test] Found larger working size in verification", { size });
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
    earlyStopped,
    userMaxSize,
  });

  return {
    success,
    maxContextFound: maxWorkingSize,
    testedSizes,
    oomSize,
    durationMs,
  };
}