/**
 * Safe JSON parsing utility.
 *
 * Replaces all unprotected JSON.parse() calls across the codebase.
 * Logs warnings on failure for server-side critical parses.
 *
 * Usage:
 *   // With fallback (UI / non-critical)
 *   const settings = safeParse(raw, {});
 *
 *   // Without fallback (critical — returns null on failure)
 *   const payload = safeParse<JobPayload>(job.payload);
 *   if (!payload) throw new Error("Invalid job payload");
 */

/**
 * Parse a JSON string safely, returning fallback on failure.
 *
 * @param raw   - JSON string or null/undefined
 * @param fallback - Value to return on parse failure (optional)
 * @returns Parsed value, fallback, or null
 */
export function safeParse<T>(raw: string | null | undefined, fallback?: T): T | null {
  if (raw === null || raw === undefined) {
    return fallback ?? null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    if (fallback !== undefined) {
      return fallback;
    }
    return null;
  }
}

import { logger } from '@/lib/logger';

/**
 * Parse JSON with a warning logged on failure.
 * Use for server-side critical parses (job payloads, DB rows).
 *
 * @param raw   - JSON string or null/undefined
 * @param label - Description for the warning log (e.g. "job payload", "decay_rates")
 * @param fallback - Value to return on parse failure (optional)
 * @returns Parsed value, fallback, or null
 */
export function safeParseWarn<T>(raw: string | null | undefined, label: string, fallback?: T): T | null {
  if (raw === null || raw === undefined) {
    return fallback ?? null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[safeParse] Failed to parse ${label}: ${message}`);
    if (fallback !== undefined) {
      return fallback;
    }
    return null;
  }
}
