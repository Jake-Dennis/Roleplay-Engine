/**
 * Parse emotional state from a JSON string (stored in DB).
 * Returns an empty object on null, empty string, or malformed JSON.
 */
import type { EmotionalState } from "@/lib/relationship-types";
import { safeParse } from "@/lib/safe-json";

export function parseEmotionalState(raw: string | null): EmotionalState {
  return safeParse<EmotionalState>(raw, {}) as EmotionalState;
}
