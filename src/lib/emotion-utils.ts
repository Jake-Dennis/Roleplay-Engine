/**
 * Parse emotional state from a JSON string (stored in DB).
 * Returns an empty object on null, empty string, or malformed JSON.
 */
import type { EmotionalState } from "@/lib/relationship-types";

export function parseEmotionalState(raw: string | null): EmotionalState {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as EmotionalState;
  } catch {
    return {};
  }
}
