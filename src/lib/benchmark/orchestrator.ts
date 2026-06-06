import { BenchmarkConfig, BenchmarkReport, HardwareInfo, OllamaModelMeta as BenchmarkOllamaModelMeta, ContextTestResult } from "./types";
import { getModelMeta, OllamaModelMeta as OllamaMetaOllamaModelMeta } from "@/lib/ollama-meta";
import { runContextTest } from "./context-test";
import { runThroughputTests } from "./throughput-test";
import { runMemoryRetentionTests, MemoryTestProgressCallback } from "./memory-test";
import { generateAutoTuneRecommendation, AutoTuneOptions } from "./auto-tune";
import { getSystemInfo } from "./system-info";
import { logger } from "@/lib/logger";

/**
 * Convert OllamaModelMeta from ollama-meta.ts to benchmark types format
 */
function convertModelMeta(meta: OllamaMetaOllamaModelMeta): BenchmarkOllamaModelMeta {
  return {
    name: meta.name,
    sizeBytes: meta.sizeBytes,
    digest: "", // Not available from ollama-meta
    family: meta.family || "unknown",
    parameterSize: `${(meta.parameterCount / 1e9).toFixed(1)}B`,
    quantizationLevel: meta.quantization || "unknown",
    contextLength: meta.contextWindow,
    embeddingLength: undefined,
    license: meta.license,
    modifiedAt: new Date().toISOString(), // Not available from ollama-meta
  };
}

export interface BenchmarkProgress {
  stage: "init" | "model-meta" | "context-test" | "throughput-test" | "memory-retention" | "auto-tune" | "complete" | "error";
  progress: number;
  message: string;
  currentTest?: string;
  /** Stage-specific progress: e.g. "tested 3 of 8 context sizes" */
  stageProgress?: { current: number; total: number };
}

export interface RunBenchmarkOptions {
  config: BenchmarkConfig;
  userId: string;
  onProgress?: (progress: BenchmarkProgress) => void;
}

function updateProgress(
  options: RunBenchmarkOptions,
  stage: BenchmarkProgress["stage"],
  progress: number,
  message: string,
  currentTest?: string,
  stageProgress?: { current: number; total: number }
) {
  options.onProgress?.({ stage, progress, message, currentTest, stageProgress });
}

/**
 * Format a token count as a human-readable size string (1K, 16K, 256K, 1M, etc).
 */
function formatSize(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

/**
 * Pre-flight check: verify Ollama is reachable and model exists.
 * Uses a lightweight /api/tags call (faster than /api/show).
 */
async function checkOllamaConnectivity(ollamaHost: string, modelName: string): Promise<boolean> {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(10000), // 10s timeout for connectivity check
    });
    if (!response.ok) return false;
    const data = await response.json();
    const models = (data.models || []) as Array<{ name: string }>;
    return models.some(m => m.name === modelName || m.name.startsWith(modelName + ":"));
  } catch {
    return false;
  }
}

export async function runBenchmark(options: RunBenchmarkOptions): Promise<BenchmarkReport> {
  const { config } = options;
  const startTime = Date.now();

  updateProgress(options, "init", 5, "Initializing benchmark...");

  // Pre-flight: verify Ollama is reachable before starting
  updateProgress(options, "init", 8, "Checking Ollama connectivity...");
  const ollamaReachable = await checkOllamaConnectivity(config.ollamaHost, config.model);
  if (!ollamaReachable) {
    throw new Error(
      `Cannot reach Ollama at ${config.ollamaHost}. ` +
      `Ensure Ollama is running and the URL is correct (configure in Settings → Ollama).`
    );
  }

  // Get model metadata
  updateProgress(options, "model-meta", 10, "Fetching model metadata...", "getModelMeta");
  const rawModelMeta = await getModelMeta(config.model, config.ollamaHost);
  const modelMeta = convertModelMeta(rawModelMeta);

  // Run context window test (uses raw model meta from ollama-meta)
  // Stage spans 20% → 50% of total progress. Emit per-test updates as each size completes.
  updateProgress(options, "context-test", 20, "Running context window test...", "context-test");
  const contextTest = await runContextTest(config, rawModelMeta, (testInfo) => {
    // Map the per-test progress (testInfo.index / testInfo.total) to the 20-50% range
    const stageProgress = { current: testInfo.index, total: testInfo.total };
    const overallProgress = 20 + Math.round((testInfo.index / Math.max(testInfo.total, 1)) * 30);
    const status = testInfo.success
      ? `Context ${formatSize(testInfo.size)} OK`
      : `Context ${formatSize(testInfo.size)} failed`;
    updateProgress(
      options,
      "context-test",
      overallProgress,
      `Tested ${testInfo.index}/${testInfo.total} sizes — ${status}`,
      `context-test-${testInfo.size}`,
      stageProgress
    );
  });

  // Run throughput tests (uses raw model meta from ollama-meta)
  // Stage spans 50% → 90% of total progress. Emit per-size updates.
  updateProgress(options, "throughput-test", 50, "Running throughput tests...", "throughput-test");
  const throughputTests = await runThroughputTests(config, rawModelMeta, contextTest, (testInfo) => {
    // Map the per-size progress (testInfo.index / testInfo.total) to the 50-90% range
    const stageProgress = { current: testInfo.index, total: testInfo.total };
    const overallProgress = 50 + Math.round((testInfo.index / Math.max(testInfo.total, 1)) * 40);
    const status = `Context ${formatSize(testInfo.size)}: ${testInfo.genTokPerSec.toFixed(1)} tok/s gen, ${testInfo.embTokPerSec.toFixed(0)} tok/s embed`;
    updateProgress(
      options,
      "throughput-test",
      overallProgress,
      `Tested ${testInfo.index}/${testInfo.total} sizes — ${status}`,
      `throughput-${testInfo.size}`,
      stageProgress
    );
  }, config.embeddingModel);

  // Run memory retention tests
  // Stage spans 90% → 95% of total progress
  updateProgress(options, "memory-retention", 90, "Running memory retention tests...", "needle-test");
  const memoryRetention = await runMemoryRetentionTests(
    config,
    rawModelMeta, // pass raw meta for model name
    contextTest,
    (testInfo) => {
      const stageProgress = { current: testInfo.current, total: testInfo.total };
      const overallProgress = 90 + Math.round((testInfo.current / Math.max(testInfo.total, 1)) * 5);
      const status = testInfo.success ? "OK" : "Failed";
      updateProgress(
        options,
        "memory-retention",
        overallProgress,
        `Tested ${testInfo.current}/${testInfo.total} — ${testInfo.test} ${status}`,
        `memory-${testInfo.test}`,
        stageProgress
      );
    }
  );

  // Detect hardware for auto-tune (provides GPU/VRAM info for accurate recommendations)
  let hardware: HardwareInfo | undefined;
  try {
    hardware = await getSystemInfo();
  } catch {
    hardware = undefined;
  }

  // Generate auto-tune recommendation (uses benchmark ceiling when hardware unavailable)
  updateProgress(options, "auto-tune", 95, "Generating recommendations...", "auto-tune");
  const autoTune = generateAutoTuneRecommendation(hardware ?? {
    cpu: { model: "Unknown", cores: 1, threads: 1 },
    memory: { totalBytes: 8 * 1024 * 1024 * 1024, availableBytes: 4 * 1024 * 1024 * 1024 },
    gpu: undefined,
    platform: "unknown",
    arch: "unknown",
  }, modelMeta, contextTest);

  // Calculate overall score
  const throughputScore = throughputTests.length > 0
    ? throughputTests.reduce((sum, t) => sum + t.generationTokensPerSec, 0) / throughputTests.length
    : 0;
  const normalizedThroughput = Math.min(throughputScore / 100, 1); // Normalize to 0-1 (100 tok/s = 1.0)
  const overallScore = (normalizedThroughput * 0.5) + (memoryRetention.overallScore * 0.3) + (contextTest.success ? 0.2 : 0);

  updateProgress(options, "complete", 100, "Benchmark complete!", "complete");

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    config,
    modelMeta,
    contextTest,
    throughputTests,
    memoryRetention,
    overallScore: Math.round(overallScore * 100) / 100,
    recommendedNumCtx: autoTune.recommendedNumCtx,
    warnings: [],
  };

  // Add warnings
  if (!contextTest.success) {
    report.warnings.push("Context test did not find a working context size");
  }
  if (contextTest.oomSize && contextTest.oomSize < Math.max(...config.testContextSizes)) {
    report.warnings.push(`OOM detected at ${contextTest.oomSize.toLocaleString()} tokens`);
  }
  if (throughputTests.some(t => t.generationTokensPerSec < 10)) {
    report.warnings.push("Low throughput detected on some context sizes");
  }

  return report;
}

export async function runBenchmarkBackground(
  config: BenchmarkConfig,
  userId: string,
  onProgress?: (progress: BenchmarkProgress) => void
): Promise<BenchmarkReport> {
  // No global timeout - let individual requests handle their own timeouts
  return runBenchmark({
    config,
    userId,
    onProgress,
  });
}