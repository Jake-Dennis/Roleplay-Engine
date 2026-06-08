import {
  BenchmarkConfig,
  BenchmarkReport,
  OllamaModelMeta as BenchmarkOllamaModelMeta,
} from "./types";
import { getModelMeta, OllamaModelMeta as OllamaMetaOllamaModelMeta } from "@/lib/ollama-meta";
import { runContextTest } from "./context-test";
import { runPredictTest } from "./predict-test";
import { runCombinationTests } from "./combination-test";
import { generateRecommendation } from "./auto-tune";

function convertModelMeta(meta: OllamaMetaOllamaModelMeta): BenchmarkOllamaModelMeta {
  return {
    name: meta.name,
    sizeBytes: meta.sizeBytes,
    digest: "",
    family: meta.family || "unknown",
    parameterSize: `${(meta.parameterCount / 1e9).toFixed(1)}B`,
    quantizationLevel: meta.quantization || "unknown",
    contextLength: meta.contextWindow,
    embeddingLength: undefined,
    license: meta.license,
    modifiedAt: new Date().toISOString(),
  };
}

export interface BenchmarkProgress {
  stage:
    | "init"
    | "model-meta"
    | "context-test"
    | "predict-test"
    | "combination-test"
    | "recommendation"
    | "complete"
    | "error";
  progress: number;
  message: string;
  currentTest?: string;
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

function formatSize(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

async function checkOllamaConnectivity(ollamaHost: string, modelName: string): Promise<boolean> {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const models = (data.models || []) as Array<{ name: string }>;
    return models.some((m) => m.name === modelName || m.name.startsWith(modelName + ":"));
  } catch {
    return false;
  }
}

export async function runBenchmark(options: RunBenchmarkOptions): Promise<BenchmarkReport> {
  const { config } = options;
  const startTime = Date.now();

  updateProgress(options, "init", 5, "Initializing benchmark...");

  // Pre-flight: verify Ollama is reachable
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

  // Stage 1: Context window test (20% → 45%)
  updateProgress(options, "context-test", 20, "Running context window test...", "context-test");
  const contextTest = await runContextTest(config, rawModelMeta, (testInfo) => {
    const stageProgress = { current: testInfo.index, total: testInfo.total };
    const overallProgress = 20 + Math.round((testInfo.index / Math.max(testInfo.total, 1)) * 25);
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

  // Stage 2: Max predict token test (45% → 65%)
  updateProgress(options, "predict-test", 45, "Running max predict token test...", "predict-test");
  const predictTest = await runPredictTest(config, (testInfo) => {
    const stageProgress = { current: testInfo.index, total: testInfo.total };
    const overallProgress = 45 + Math.round((testInfo.index / Math.max(testInfo.total, 1)) * 20);
    const status = testInfo.success
      ? `Predict ${formatSize(testInfo.size)} OK`
      : `Predict ${formatSize(testInfo.size)} failed`;
    updateProgress(
      options,
      "predict-test",
      overallProgress,
      `Tested ${testInfo.index}/${testInfo.total} — ${status}`,
      `predict-test-${testInfo.size}`,
      stageProgress
    );
  });

  // Stage 3: Combination grid (65% → 90%)
  updateProgress(options, "combination-test", 65, "Testing context × predict combinations...", "combination-test");
  const combinations = await runCombinationTests(config, contextTest, (testInfo) => {
    const stageProgress = { current: testInfo.index, total: testInfo.total };
    const overallProgress = 65 + Math.round((testInfo.index / Math.max(testInfo.total, 1)) * 25);
    const status = testInfo.success
      ? `${formatSize(testInfo.contextSize)} ctx → ${formatSize(testInfo.maxNumPredict)} predict OK`
      : `${formatSize(testInfo.contextSize)} ctx failed`;
    updateProgress(
      options,
      "combination-test",
      overallProgress,
      `Tested ${testInfo.index}/${testInfo.total} — ${status}`,
      `combo-${testInfo.contextSize}`,
      stageProgress
    );
  });

  // Generate recommendation (90% → 100%)
  updateProgress(options, "recommendation", 90, "Generating recommendations...", "recommendation");
  const recommendation = generateRecommendation(contextTest, predictTest, combinations);

  updateProgress(options, "complete", 100, "Benchmark complete!", "complete");

  const warnings: string[] = [];
  if (!contextTest.success) {
    warnings.push("Context test did not find a working context size");
  }
  if (contextTest.oomSize) {
    warnings.push(`OOM detected at ${contextTest.oomSize.toLocaleString()} context tokens`);
  }
  if (!predictTest.success) {
    warnings.push("Predict test did not find a working predict token size");
  }
  if (predictTest.oomSize) {
    warnings.push(`OOM detected at ${predictTest.oomSize.toLocaleString()} predict tokens`);
  }

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    config,
    modelMeta,
    contextTest,
    predictTest,
    combinations,
    recommendedNumCtx: recommendation.recommendedNumCtx,
    recommendedNumPredict: recommendation.recommendedNumPredict,
    warnings,
  };

  return report;
}

export async function runBenchmarkBackground(
  config: BenchmarkConfig,
  userId: string,
  onProgress?: (progress: BenchmarkProgress) => void
): Promise<BenchmarkReport> {
  return runBenchmark({ config, userId, onProgress });
}
