import { BenchmarkConfig, ContextTestResult } from "./types";
import type { ThroughputResult } from "./types";
import { OllamaModelMeta } from "../ollama-meta";
import { generateTextStream, generateEmbedding } from "../ollama";
import { OLLAMA_CONFIG } from "../config";
import { logger } from "../logger";

const TOKEN_ESTIMATE_CHARS = 4;

/**
 * Approximate token count from text length (English heuristic: ~4 chars per token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATE_CHARS);
}

/**
 * Build a prompt of approximately the target token count.
 * Uses "Lorem ipsum " (12 chars ≈ 3 tokens) repeated to fill the space.
 */
function buildPromptForContext(targetTokens: number): string {
  const basePrompt = "Write a detailed story about a space explorer. ";
  const filler = "Lorem ipsum ";
  const fillerTokens = estimateTokens(filler);
  const baseTokens = estimateTokens(basePrompt);
  const remainingTokens = Math.max(0, targetTokens - baseTokens);
  const fillerCount = Math.ceil(remainingTokens / fillerTokens);
  return basePrompt + filler.repeat(fillerCount);
}

/**
 * Build embedding text of approximately the target token count.
 */
function buildEmbeddingTextForContext(targetTokens: number): string {
  const filler = "Lorem ipsum ";
  const fillerTokens = estimateTokens(filler);
  const fillerCount = Math.ceil(targetTokens / fillerTokens);
  return filler.repeat(fillerCount);
}

/**
 * Warm-up run to load the model into memory.
 */
async function warmUpModel(model: string, think?: boolean, ollamaHost?: string): Promise<void> {
  try {
    await generateTextStream(
      "Hello",
      () => {},
      { model, ollamaHost, ...(think !== undefined ? { think } : {}) }
    );
  } catch {
    // Warm-up failure is non-fatal
    logger.debug("Warm-up run failed, continuing anyway");
  }
}

/**
 * Run generation throughput test for a single context size.
 * Returns { tokensPerSec, firstTokenLatencyMs, durationMs, outputTokens }
 */
async function runGenerationTest(
  contextSize: number,
  config: BenchmarkConfig,
  model: string,
  ollamaHost: string
): Promise<{ tokensPerSec: number; firstTokenLatencyMs: number; durationMs: number; outputTokens: number }> {
  const targetPromptTokens = Math.floor(contextSize / 4);
  const prompt = buildPromptForContext(targetPromptTokens);

  let firstTokenReceived = false;
  let firstTokenTime = 0;
  let outputText = "";
  const startTime = Date.now();

  await generateTextStream(
    prompt,
    (chunk) => {
      if (!firstTokenReceived) {
        firstTokenReceived = true;
        firstTokenTime = Date.now();
      }
      outputText += chunk;
    },
    {
      model,
      num_ctx: contextSize,
      ollamaHost,
      ...(config.thinkingMode !== undefined ? { think: config.thinkingMode } : {}),
    }
  );

  const endTime = Date.now();
  const durationMs = endTime - startTime;
  const outputTokens = estimateTokens(outputText);
  const durationSec = durationMs / 1000;
  const tokensPerSec = durationSec > 0 ? outputTokens / durationSec : 0;
  const firstTokenLatencyMs = firstTokenReceived ? firstTokenTime - startTime : durationMs;

  return { tokensPerSec, firstTokenLatencyMs, durationMs, outputTokens };
}

/**
 * Run embedding throughput test for a single context size.
 * Returns { tokensPerSec, durationMs, inputTokens }
 */
async function runEmbeddingTest(
  contextSize: number,
  config: BenchmarkConfig,
  embeddingModel: string,
  ollamaHost: string
): Promise<{ tokensPerSec: number; durationMs: number; inputTokens: number }> {
  const targetTokens = Math.floor(contextSize / 2);
  const text = buildEmbeddingTextForContext(targetTokens);
  const inputTokens = estimateTokens(text);

  const startTime = Date.now();

  await generateEmbedding(text, {
    model: embeddingModel,
    ollamaHost,
  });

  const endTime = Date.now();
  const durationMs = endTime - startTime;
  const durationSec = durationMs / 1000;
  const tokensPerSec = durationSec > 0 ? inputTokens / durationSec : 0;

  return { tokensPerSec, durationMs, inputTokens };
}

/**
 * Callback fired after each throughput size is tested.
 * Used by the orchestrator to update the UI progress bar in real time.
 */
export type ThroughputTestProgressCallback = (
  info: { size: number; index: number; total: number; genTokPerSec: number; embTokPerSec: number }
) => void;

/**
 * Run throughput tests (generation + embedding) at various context sizes.
 *
 * @param config - Benchmark configuration including test context sizes and timeouts
 * @param modelMeta - Model metadata from Ollama (provides model names and context length)
 * @param contextTestResult - Optional context test result to filter out failed sizes
 * @param onTestProgress - Optional callback fired after each size completes
 * @returns Array of throughput results for each tested context size
 */
export async function runThroughputTests(
  config: BenchmarkConfig,
  modelMeta: OllamaModelMeta,
  contextTestResult?: ContextTestResult,
  onTestProgress?: ThroughputTestProgressCallback,
  embeddingModel?: string
): Promise<ThroughputResult[]> {
  const results: ThroughputResult[] = [];
  const llmModel = config.model || modelMeta.name;
  // Use configured embedding model; ollama-meta doesn't expose embedding model info
  const resolvedEmbeddingModel = embeddingModel || OLLAMA_CONFIG.embeddingModel;

  // Determine which context sizes to skip based on context test results
  const failedSizes = new Set<number>();
  if (contextTestResult) {
    for (const tested of contextTestResult.testedSizes) {
      if (!tested.success) {
        failedSizes.add(tested.size);
      }
    }
  }

  // Model's reported context window (from ollama-meta)
  const modelContextWindow = modelMeta.contextWindow || 0;

  // Build the list of sizes we'll actually test (so progress counts match)
  const sizesToTest = config.testContextSizes.filter((size) => {
    if (failedSizes.has(size)) return false;
    if (modelContextWindow > 0 && size > modelContextWindow) return false;
    return true;
  });
  const totalSizes = sizesToTest.length;

  // Warm-up run to load model
  logger.info("[benchmark] Running warm-up generation...");
  await warmUpModel(llmModel, config.thinkingMode, config.ollamaHost);

  let completed = 0;
  for (const contextSize of config.testContextSizes) {
    if (failedSizes.has(contextSize)) {
      logger.info(`[benchmark] Skipping context size ${contextSize} (failed in context test)`);
      continue;
    }

    if (modelContextWindow > 0 && contextSize > modelContextWindow) {
      logger.info(`[benchmark] Skipping context size ${contextSize} (exceeds model max ${modelContextWindow})`);
      continue;
    }

    logger.info(`[benchmark] Testing throughput at context size ${contextSize}...`);

    // Generation throughput test
    let genResult: { tokensPerSec: number; firstTokenLatencyMs: number; durationMs: number; outputTokens: number };
    try {
      genResult = await runGenerationTest(contextSize, config, llmModel, config.ollamaHost);
      logger.info(`[benchmark] Generation @ ${contextSize}: ${genResult.tokensPerSec.toFixed(2)} tok/s, first token ${genResult.firstTokenLatencyMs}ms`);
    } catch (err) {
      logger.error(`[benchmark] Generation test failed at context ${contextSize}:`, err);
      genResult = { tokensPerSec: 0, firstTokenLatencyMs: 0, durationMs: 0, outputTokens: 0 };
    }

    // Embedding throughput test
    let embResult: { tokensPerSec: number; durationMs: number; inputTokens: number };
    try {
      embResult = await runEmbeddingTest(contextSize, config, resolvedEmbeddingModel, config.ollamaHost);
      logger.info(`[benchmark] Embedding @ ${contextSize}: ${embResult.tokensPerSec.toFixed(2)} tok/s`);
    } catch (err) {
      logger.error(`[benchmark] Embedding test failed at context ${contextSize}:`, err);
      embResult = { tokensPerSec: 0, durationMs: 0, inputTokens: 0 };
    }

    // Use the longer of the two durations as the overall duration
    const overallDurationMs = Math.max(genResult.durationMs, embResult.durationMs);

    results.push({
      contextSize,
      generationTokensPerSec: genResult.tokensPerSec,
      embeddingTokensPerSec: embResult.tokensPerSec,
      firstTokenLatencyMs: genResult.firstTokenLatencyMs,
      durationMs: overallDurationMs,
    });

    // Emit per-test progress
    completed++;
    if (onTestProgress) {
      onTestProgress({
        size: contextSize,
        index: completed,
        total: totalSizes,
        genTokPerSec: genResult.tokensPerSec,
        embTokPerSec: embResult.tokensPerSec,
      });
    }
  }

  return results;
}

export type { ThroughputResult } from "./types";