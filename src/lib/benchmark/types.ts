export interface BenchmarkConfig {
  model: string;
  ollamaHost: string;
  testContextSizes: number[];
  quickMode: boolean;
  /**
   * Whether to enable thinking mode on thinking-capable models (Qwen3.x, etc).
   * - `true` = explicitly enable
   * - `false` = explicitly disable
   * - `undefined` = let the model default
   */
  thinkingMode?: boolean;
  /**
   * Maximum context size to test. The context test will search up to this
   * size to find the actual working limit.
   */
  maxContextSize?: number;
  /**
   * Maximum predict tokens (num_predict) to test. Used as upper bound
   * for the predict token search and combination grid.
   * Default: 32768 (32K)
   */
  maxPredictTokens?: number;
}

export interface ContextTestResult {
  success: boolean;
  maxContextFound: number;
  testedSizes: { size: number; success: boolean; error?: string; isTimeout?: boolean }[];
  oomSize?: number;
  durationMs: number;
}

export interface PredictTestResult {
  success: boolean;
  maxPredictFound: number;
  testedSizes: { size: number; success: boolean; error?: string }[];
  oomSize?: number;
  durationMs: number;
}

export interface CombinationResult {
  contextSize: number;
  maxNumPredict: number;
  success: boolean;
  resultPredictSizes: { size: number; success: boolean; error?: string }[];
  durationMs: number;
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

export interface RoleplayFactResult {
  category: "character" | "location" | "rule";
  fact: string;
  recalled: boolean;
  details: string;
}

export interface TurnResult {
  turn: number;
  prompt: string;
  recallRate: number;
  formatScore: number;
  contradictionCount: number;
  factResults: RoleplayFactResult[];
  error?: string;
}

export interface RoleplayTestResult {
  lorePackName: string;
  setting: string;
  overallScore: number;
  turnsCompleted: number;
  totalTurns: number;
  averageRecallRate: number;
  averageFormatScore: number;
  totalContradictions: number;
  contradictions: string[];
  turnResults: TurnResult[];
  durationMs: number;
}

export interface BenchmarkReport {
  timestamp: string;
  config: BenchmarkConfig;
  modelMeta: OllamaModelMeta;
  contextTest: ContextTestResult;
  predictTest: PredictTestResult;
  combinations: CombinationResult[];
  roleplayTest?: RoleplayTestResult;
  recommendedNumCtx: number;
  recommendedNumPredict: number;
  warnings: string[];
}
