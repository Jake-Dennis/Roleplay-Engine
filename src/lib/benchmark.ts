/**
 * Benchmark — test a specific context size for speed and stability.
 * Runs a single prompt at each size and measures tok/s.
 * No quality/memory keyword tests — they're noisy and not actionable.
 */

import { generateTextWithMetrics } from "./ollama";

// ── Types ──────────────────────────────────────────────────────────

export interface BenchmarkPoint {
  contextSize: number;
  tokPerSec: number;
  success: boolean;
  durationMs: number;
  error?: string;
}

const TEST_PROMPT = `You are a narrator in a fantasy world. Write a short scene where a traveler arrives at an inn after a long journey. Describe the inn, the innkeeper, and one other patron. Include dialogue and sensory details.`;

// ── Test a single context size ─────────────────────────────────────

export async function runBenchmark(
  model: string,
  ollamaHost: string,
  contextSize: number,
  onProgress?: (pct: number, message: string) => void,
  thinkingMode?: boolean
): Promise<BenchmarkPoint> {
  const totalStart = Date.now();
  const thinkOpt = thinkingMode !== undefined ? { think: thinkingMode } : { think: false };

  // 1. Warmup — tiny generation to load model into memory
  onProgress?.(10, "Warming up...");
  try {
    await generateTextWithMetrics("Hello", { model, num_ctx: contextSize, num_predict: 1, ollamaHost });
  } catch { /* non-fatal */ }

  // 2. Speed test — generate a scene, measure tok/s
  onProgress?.(40, "Running speed test...");
  let tokPerSec = 0;
  let success = false;

  try {
    const r = await generateTextWithMetrics(TEST_PROMPT, {
      model, num_ctx: contextSize, num_predict: 512, ollamaHost, ...thinkOpt,
    });
    if (r.text && r.text.trim().length >= 20) {
      tokPerSec = r.tokPerSec;
      success = true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { contextSize, tokPerSec: 0, success: false, durationMs: Date.now() - totalStart, error: msg };
  }

  return { contextSize, tokPerSec, success: true, durationMs: Date.now() - totalStart };
}
