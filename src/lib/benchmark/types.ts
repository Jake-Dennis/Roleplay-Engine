export interface HardwareInfo {
  cpu: {
    model: string;
    cores: number;
    threads: number;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
  };
  gpu?: {
    name: string;
    vramBytes: number;
    driverVersion?: string;
    cudaCores?: number;
  }[];
  platform: string;
  arch: string;
}

export interface OllamaModelMeta {
  name: string;
  sizeBytes: number;
  digest: string;
  family: string;
  parameterSize: string;
  quantizationLevel: string;
  contextLength: number;
  embeddingLength?: number;
  license?: string;
  modifiedAt: string;
}

export interface BenchmarkConfig {
  model: string;
  ollamaHost: string;
  embeddingModel?: string;
  testContextSizes: number[];
  quickMode: boolean;
  retentionTestTurns: number;
  needleDepthPercent: number;
  /**
   * Whether to enable thinking mode on thinking-capable models (Qwen3.x, etc).
   * - `true` = explicitly enable (model may think even for trivial prompts)
   * - `false` = explicitly disable (no thinking tokens, direct answers)
   * - `undefined` = let the model default (Ollama decides based on the model)
   *
   * For accurate throughput/benchmark measurements, `false` is recommended
   * because thinking tokens inflate generation time without measuring useful work.
   */
  thinkingMode?: boolean;
  /**
   * Maximum context size to test. The context test will binary search up to this
   * size to find the actual working limit. Higher values give more accurate results
   * but take longer on weak hardware.
   *
   * Default: 131072 (128K). Recommended: 262144 (256K) for most setups,
   * 524288 (512K) or 1048576 (1M) for high-VRAM GPUs.
   */
  maxContextSize?: number;
}

export interface ContextTestResult {
  success: boolean;
  maxContextFound: number;
  testedSizes: { size: number; success: boolean; error?: string; isTimeout?: boolean }[];
  oomSize?: number;
  durationMs: number;
}

export interface ThroughputResult {
  contextSize: number;
  generationTokensPerSec: number;
  embeddingTokensPerSec: number;
  firstTokenLatencyMs: number;
  durationMs: number;
}

export interface NeedleTestResult {
  contextSize: number;
  needleDepthPercent: number;
  retrieved: boolean;
  similarityScore: number;
  durationMs: number;
}

export interface MultiTurnTestResult {
  contextSize: number;
  turns: number;
  entityConsistencyScore: number;
  factualDriftScore: number;
  durationMs: number;
}

export interface SummarizationFidelityResult {
  originalTokens: number;
  summaryTokens: number;
  compressionRatio: number;
  fidelityScore: number;
  durationMs: number;
}

export interface MemoryRetentionResult {
  needleTests: NeedleTestResult[];
  multiTurnTests: MultiTurnTestResult[];
  summarizationTests: SummarizationFidelityResult[];
  overallScore: number;
}

export interface BenchmarkReport {
  timestamp: string;
  config: BenchmarkConfig;
  hardware?: HardwareInfo; // Optional - not collected by default
  modelMeta: OllamaModelMeta;
  contextTest: ContextTestResult;
  throughputTests: ThroughputResult[];
  memoryRetention: MemoryRetentionResult;
  overallScore: number;
  recommendedNumCtx: number;
  warnings: string[];
}

export interface AutoTuneRecommendation {
  recommendedNumCtx: number;
  reasoning: string[];
  vramLimit: number;
  vramUsageAtRecommended: number;
  safetyMargin: number;
  fallbackNumCtx: number;
}