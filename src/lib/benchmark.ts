/**
 * Benchmark — test a specific context size by filling the window to the target.
 * Sends enough tokens to approach the target context size, then runs a speed test.
 * If the model can't handle that context, it fails honestly (OOM, empty, etc).
 */

import { generateTextWithMetrics } from "./ollama";

export interface BenchmarkPoint {
  contextSize: number;
  tokPerSec: number;
  success: boolean;
  durationMs: number;
  error?: string;
}

const TEST_PROMPT = `You are a narrator in a fantasy world. Write a short scene where a traveler arrives at an inn after a long journey. Describe the inn, the innkeeper, and one other patron. Include dialogue and sensory details.`;

// Rough token estimate (chars / 4)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function runBenchmark(
  model: string,
  ollamaHost: string,
  contextSize: number,
  onProgress?: (pct: number, message: string) => void,
  thinkingMode?: boolean
): Promise<BenchmarkPoint> {
  const totalStart = Date.now();
  const thinkOpt = thinkingMode !== undefined ? { think: thinkingMode } : { think: false };

  // 1. Warmup
  onProgress?.(10, "Warming up...");
  try {
    await generateTextWithMetrics("Hello", { model, num_ctx: contextSize, num_predict: 1, ollamaHost });
  } catch { /* non-fatal */ }

  // 2. Build a prompt that fills the context window
  onProgress?.(30, `Building ${(contextSize / 1024).toFixed(0)}K prompt...`);

  // Calculate how much filler we need to approach the target size
  const testTokens = estimateTokens(TEST_PROMPT);
  const fillerTokensNeeded = Math.max(0, contextSize - testTokens - 100); // 100 token buffer
  const fillerWordsNeeded = Math.ceil(fillerTokensNeeded * 4 / 6); // ~6 chars per "filler " word

  // Generate filler: a repeating block that won't confuse the model
  const fillerWord = "artemis ";
  const filler = fillerWord.repeat(fillerWordsNeeded);

  const prompt = filler + TEST_PROMPT;

  // 3. Speed test with the filled prompt
  onProgress?.(40, `Testing ${(contextSize / 1024).toFixed(0)}K context...`);
  let tokPerSec = 0;
  let success = false;

  try {
    const r = await generateTextWithMetrics(prompt, {
      model, num_ctx: contextSize, num_predict: 512, ollamaHost, ...thinkOpt,
    });
    if (r.text && r.text.trim().length >= 5) {
      tokPerSec = r.tokPerSec;
      success = true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { contextSize, tokPerSec: 0, success: false, durationMs: Date.now() - totalStart, error: msg };
  }

  return { contextSize, tokPerSec, success: true, durationMs: Date.now() - totalStart };
}
