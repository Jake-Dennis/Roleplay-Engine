/**
 * Ollama Busy Tracker
 *
 * Tracks whether Ollama is currently processing a user-facing generation
 * request. Background jobs check this before starting — if a user generation
 * is active, jobs yield to avoid competing for Ollama.
 *
 * This is NOT a mutex or lock. It's a cooperative readiness flag:
 * - The generate route marks busy before streaming, idle after
 * - The job processor checks before starting each job
 * - Jobs process one-at-a-time in a cascade after generation completes
 */

let generationCount = 0;

/**
 * Returns true if a user-facing generation is currently using Ollama.
 * Background jobs should NOT start when this is true.
 */
export function isOllamaBusy(): boolean {
  return generationCount > 0;
}

/**
 * Mark Ollama as busy with a user-facing generation.
 * Called before starting a generateTextStream call.
 */
export function markOllamaBusy(): void {
  generationCount++;
}

/**
 * Mark Ollama as idle after a user-facing generation completes.
 * Called after generateTextStream finishes or errors.
 */
export function markOllamaIdle(): void {
  generationCount = Math.max(0, generationCount - 1);
}
