import { ContextTestResult, PredictTestResult, CombinationResult } from "./types";

export interface Recommendation {
  recommendedNumCtx: number;
  recommendedNumPredict: number;
}

/**
 * Generate the recommended (num_ctx, num_predict) pair from benchmark results.
 *
 * Strategy:
 * 1. If we have combination results, use the combination with the highest
 *    (contextSize * maxNumPredict) product — this finds the best balanced pair.
 * 2. If no combination results (e.g., all failed), use the context and predict
 *    maxes independently with a safety margin.
 */
export function generateRecommendation(
  contextTest: ContextTestResult,
  predictTest: PredictTestResult,
  combinations: CombinationResult[]
): Recommendation {
  // Prefer combination results for balanced recommendation
  if (combinations.length > 0) {
    const successful = combinations.filter((c) => c.success);
    if (successful.length > 0) {
      // Score each combination by product of ctx × predict (higher = more total capacity)
      // But also penalize extreme imbalances
      let bestPair = successful[0];
      let bestScore = 0;

      for (const combo of successful) {
        const product = combo.contextSize * combo.maxNumPredict;
        // Apply a balance penalty: highly skewed pairs get lower scores
        const ratio =
          Math.max(combo.contextSize, combo.maxNumPredict) /
          Math.max(Math.min(combo.contextSize, combo.maxNumPredict), 1);
        const balanceFactor = Math.min(1, 100 / ratio); // ratio of 100+ gets penalized
        const score = product * balanceFactor;

        if (score > bestScore) {
          bestScore = score;
          bestPair = combo;
        }
      }

      // Apply 90% safety margin
      const recommendedNumCtx = Math.max(1024, Math.floor((bestPair.contextSize * 0.9) / 1024) * 1024);
      const recommendedNumPredict = Math.max(256, Math.floor((bestPair.maxNumPredict * 0.9) / 256) * 256);

      return { recommendedNumCtx, recommendedNumPredict };
    }
  }

  // Fallback: use individual maxes
  const rawCtx = contextTest.success ? contextTest.maxContextFound : 4096;
  const rawPredict = predictTest.success ? predictTest.maxPredictFound : 1024;

  return {
    recommendedNumCtx: Math.max(1024, Math.floor((rawCtx * 0.85) / 1024) * 1024),
    recommendedNumPredict: Math.max(256, Math.floor((rawPredict * 0.85) / 256) * 256),
  };
}
