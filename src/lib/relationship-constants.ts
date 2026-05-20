/**
 * Shared constants for the relationship system.
 * Extracted to break circular dependency between relationship-decay and relationship-markdown.
 */

export const EMOTION_HALF_LIVES: Record<string, number> = {
  trust: 30,
  suspicion: 60,
  loyalty: 30,
  resentment: 90,
  attraction: 14,
  respect: 30,
  fear: 14,
};
