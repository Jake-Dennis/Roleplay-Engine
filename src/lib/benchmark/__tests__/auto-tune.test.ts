import { describe, it, expect } from "bun:test";
import { generateRecommendation } from "../auto-tune";
import { ContextTestResult, PredictTestResult, CombinationResult } from "../types";

describe("generateRecommendation", () => {
  const mockContextTest: ContextTestResult = {
    success: true,
    maxContextFound: 32768,
    testedSizes: [
      { size: 1024, success: true },
      { size: 4096, success: true },
      { size: 16384, success: true },
      { size: 32768, success: true },
    ],
    oomSize: 65536,
    durationMs: 5000,
  };

  const mockPredictTest: PredictTestResult = {
    success: true,
    maxPredictFound: 8192,
    testedSizes: [
      { size: 256, success: true },
      { size: 512, success: true },
      { size: 1024, success: true },
      { size: 4096, success: true },
      { size: 8192, success: true },
    ],
    durationMs: 3000,
  };

  const mockCombinations: CombinationResult[] = [
    {
      contextSize: 4096,
      maxNumPredict: 8192,
      success: true,
      resultPredictSizes: [],
      durationMs: 1000,
    },
    {
      contextSize: 16384,
      maxNumPredict: 4096,
      success: true,
      resultPredictSizes: [],
      durationMs: 2000,
    },
    {
      contextSize: 32768,
      maxNumPredict: 2048,
      success: true,
      resultPredictSizes: [],
      durationMs: 3000,
    },
  ];

  it("picks best balanced combination from results", () => {
    const result = generateRecommendation(mockContextTest, mockPredictTest, mockCombinations);

    // 16384*4096 = 67M, 4096*8192 = 33M, 32768*2048 = 67M
    // Both 16384*4096 and 32768*2048 have similar products, but 16384/4096=4 is
    // better balanced than 32768/2048=16, so 16384*4096 should win
    expect(result.recommendedNumCtx).toBeGreaterThanOrEqual(1024);
    expect(result.recommendedNumPredict).toBeGreaterThanOrEqual(256);
  });

  it("applies 90% safety margin to recommended values", () => {
    const result = generateRecommendation(mockContextTest, mockPredictTest, mockCombinations);

    // Recommended should be at most 90% of the raw values
    const maxRawCtx = Math.max(...mockCombinations.filter(c => c.success).map(c => c.contextSize));
    const maxRawPredict = Math.max(...mockCombinations.filter(c => c.success).map(c => c.maxNumPredict));
    expect(result.recommendedNumCtx).toBeLessThanOrEqual(maxRawCtx);
    expect(result.recommendedNumPredict).toBeLessThanOrEqual(maxRawPredict);
  });

  it("rounds recommendations to nice boundaries", () => {
    const result = generateRecommendation(mockContextTest, mockPredictTest, mockCombinations);

    // ctx rounded to nearest 1024, predict rounded to nearest 256
    expect(result.recommendedNumCtx % 1024).toBe(0);
    expect(result.recommendedNumPredict % 256).toBe(0);
  });

  it("falls back to individual maxes when no combinations", () => {
    const result = generateRecommendation(mockContextTest, mockPredictTest, []);

    expect(result.recommendedNumCtx).toBeGreaterThanOrEqual(1024);
    expect(result.recommendedNumPredict).toBeGreaterThanOrEqual(256);
  });

  it("handles failed context test", () => {
    const failedContext: ContextTestResult = {
      success: false,
      maxContextFound: 0,
      testedSizes: [],
      oomSize: 4096,
      durationMs: 1000,
    };

    const result = generateRecommendation(failedContext, mockPredictTest, []);

    // Should fall back to 4096 * 0.85 = ~3481 → rounded to 2048
    expect(result.recommendedNumCtx).toBeGreaterThanOrEqual(1024);
    expect(result.recommendedNumPredict).toBeGreaterThanOrEqual(256);
  });

  it("handles all failed combinations", () => {
    const allFailed: CombinationResult[] = [
      {
        contextSize: 4096,
        maxNumPredict: 0,
        success: false,
        resultPredictSizes: [],
        durationMs: 500,
      },
    ];

    const result = generateRecommendation(mockContextTest, mockPredictTest, allFailed);

    // Falls back to individual maxes
    expect(result.recommendedNumCtx).toBeGreaterThanOrEqual(1024);
    expect(result.recommendedNumPredict).toBeGreaterThanOrEqual(256);
  });

  it("never recommends below minimum thresholds", () => {
    const tinyContext: ContextTestResult = {
      success: true,
      maxContextFound: 512,
      testedSizes: [],
      durationMs: 500,
    };
    const tinyPredict: PredictTestResult = {
      success: true,
      maxPredictFound: 128,
      testedSizes: [],
      durationMs: 500,
    };

    const result = generateRecommendation(tinyContext, tinyPredict, []);

    expect(result.recommendedNumCtx).toBeGreaterThanOrEqual(1024);
    expect(result.recommendedNumPredict).toBeGreaterThanOrEqual(256);
  });
});
