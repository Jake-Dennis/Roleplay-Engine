/**
 * GET /api/entities/merge-suggestions
 *
 * Scans the entity_registry for entities with similar display names
 * that might be duplicates. Uses simple normalized name comparison:
 * strips common prefixes, lowercases, and checks for significant overlap.
 *
 * Returns suggestions grouped by user_id.
 */

import { withErrorHandler } from "@/lib/with-error-handler";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";

interface EntityRow {
  id: string;
  entity_type: string;
  display_name: string;
  user_id: string;
}

const STRIP_WORDS = new Set(["the", "a", "an", "old", "new", "great", "little", "sir", "lady"]);

/**
 * Normalize a name for comparison: lowercase, strip common words/punctuation.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => !STRIP_WORDS.has(w) && w.length > 1)
    .join(" ");
}

/**
 * Simple similarity: 0-1 based on common words / total unique words.
 */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const db = getDb();
  const entities = db.prepare(
    "SELECT id, entity_type, display_name, user_id FROM entity_registry WHERE user_id = ?"
  ).all(userId) as EntityRow[];

  const suggestions: Array<{
    sourceId: string;
    sourceName: string;
    sourceType: string;
    targetId: string;
    targetName: string;
    targetType: string;
    score: number;
  }> = [];

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      // Only suggest merges within the same type (or character types)
      const sameType = a.entity_type === b.entity_type;
      const bothChars = (a.entity_type === "persona" || a.entity_type === "npc") &&
                        (b.entity_type === "persona" || b.entity_type === "npc");
      if (!sameType && !bothChars) continue;

      const score = similarity(a.display_name, b.display_name);
      if (score >= 0.5) {
        suggestions.push({
          sourceId: a.id,
          sourceName: a.display_name,
          sourceType: a.entity_type,
          targetId: b.id,
          targetName: b.display_name,
          targetType: b.entity_type,
          score: Math.round(score * 100) / 100,
        });
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  return NextResponse.json({ suggestions });
});
