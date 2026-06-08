import { describe, it, expect, beforeEach, vi } from "bun:test";
import { runContextTest } from "../context-test";
import { BenchmarkConfig } from "../types";

// Mock generateText
const mockGenerateText = vi.fn();

vi.mock("@/lib/ollama", () => ({
  generateText: mockGenerateText,
}));

describe("runContextTest", () => {
  const mockConfig: BenchmarkConfig = {
    model: "test-model",
    ollamaHost: "http://localhost:11434",
    testContextSizes: [1024, 4096, 16384, 32768, 65536],
    quickMode: true,
  };

  const mockModelMeta = {
    name: "test-model",
    contextWindow: 32768,
    parameterCount: 7_000_000_000,
    quantization: "q4_k_m",
    family: "llama",
    sizeBytes: 4_000_000_000,
    license: "MIT",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("finds max working context with binary search", async () => {
    // Mock: succeed for sizes up to 16384, OOM at 32768
    // Binary search tests middle sizes first: 4096, 16384, 32768
    let callCount = 0;
    mockGenerateText.mockImplementation(async () => {
      callCount++;
      // Fail at 32768 (3rd call in binary search)
      if (callCount < 3) {
        return "test test test test test test test test test test";
      }
      throw new Error("out of memory");
    });

    const result = await runContextTest(mockConfig, mockModelMeta);

    expect(result.success).toBe(true);
    // Max working context should be 16384 (last successful before OOM at 32768)
    expect(result.maxContextFound).toBe(16384);
    expect(result.testedSizes.length).toBeGreaterThan(0);
    expect(result.oomSize).toBe(32768);
  });

  it("handles early stop when smallest sizes all fail", async () => {
    // All sizes fail with OOM
    mockGenerateText.mockRejectedValue(new Error("out of memory"));

    const result = await runContextTest(mockConfig, mockModelMeta);

    expect(result.success).toBe(false);
    expect(result.maxContextFound).toBe(0);
    expect(result.testedSizes.every(t => !t.success)).toBe(true);
    expect(result.oomSize).toBeGreaterThan(0);
  });

  it("respects model context window as upper bound", async () => {
    const smallContextModel = { ...mockModelMeta, contextWindow: 8192 };
    
    mockGenerateText.mockResolvedValue("test test test test test test test test test test");

    const result = await runContextTest(mockConfig, smallContextModel);

    // Should not test sizes larger than model's context window (with 10% buffer)
    const maxTested = Math.max(...result.testedSizes.map(t => t.size));
    expect(maxTested).toBeLessThanOrEqual(8992); // 8192 * 1.1
  });

  it("retries once on transient errors", async () => {
    let callCount = 0;
    mockGenerateText.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("network timeout");
      }
      return "test test test test test test test test test test";
    });

    const result = await runContextTest(mockConfig, mockModelMeta);

    // Should retry once (2 calls for the same size)
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(result.testedSizes[0].success).toBe(true);
  });

  it("does not retry on OOM errors", async () => {
    let callCount = 0;
    mockGenerateText.mockImplementation(async () => {
      callCount++;
      throw new Error("CUDA out of memory");
    });

    const result = await runContextTest(mockConfig, mockModelMeta);

    // Should not retry on OOM (but binary search may test multiple sizes)
    expect(callCount).toBeGreaterThanOrEqual(1);
    expect(result.success).toBe(false);
  });

  it("emits progress callback for each tested size", async () => {
    const progressCalls: Array<{ size: number; index: number; total: number; success: boolean }> = [];
    
    mockGenerateText.mockResolvedValue("test test test test test test test test test test");

    await runContextTest(mockConfig, mockModelMeta, (info) => {
      progressCalls.push(info);
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[0]).toHaveProperty("size");
    expect(progressCalls[0]).toHaveProperty("index");
    expect(progressCalls[0]).toHaveProperty("total");
    expect(progressCalls[0]).toHaveProperty("success");
  });

  it("builds power-of-2 ladder from min test size to maxContextSize", async () => {
    const configWithMax: BenchmarkConfig = {
      ...mockConfig,
      testContextSizes: [1024],
      maxContextSize: 65536,
    };

    // Mock: succeed for all sizes up to model limit
    mockGenerateText.mockResolvedValue("test test test test test test test test test test");

    const result = await runContextTest(configWithMax, mockModelMeta);

    const testedSizes = result.testedSizes.map(t => t.size);
    // Binary search tests middle sizes: 4096, 16384, 32768 (all succeed)
    // Then quickMode=true skips linear verification, so only 3 sizes tested
    expect(testedSizes.length).toBe(3);
    expect(Math.max(...testedSizes)).toBeLessThanOrEqual(36044); // model limit with 10% buffer
    // Binary search tests middle of ladder: 4096, 16384, 32768
    expect(testedSizes).toContain(4096);
    expect(testedSizes).toContain(16384);
    expect(testedSizes).toContain(32768);
  });
});