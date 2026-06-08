import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { withErrorHandler } from "@/lib/with-error-handler";
import { findMergeCandidates } from "@/lib/wiki/merge-suggester";
import { join } from "path";

/**
 * GET /api/wiki/merge-suggestions
 *
 * Find candidate wiki pages that might be duplicates and should be merged.
 *
 * Query parameters:
 *   - strategy: "A" | "B" | "C" (default: "A")
 *       A = Same title, different paths (cheap)
 *       B = High wikilink overlap (medium)
 *       C = LLM analysis of top candidates (expensive, currently a stub)
 *   - limit: number (default: 20)
 *
 * Response (200):
 * ```json
 * {
 *   "candidates": [
 *     {
 *       "pageA": "entities/characters/gandalf.md",
 *       "pageB": "entities/characters/gandalf-alt.md",
 *       "confidence": 0.95,
 *       "reason": "Same title: \"Gandalf\"",
 *       "strategy": "A"
 *     }
 *   ],
 *   "count": 1
 * }
 * ```
 *
 * @throws 400 - If strategy is invalid
 * @throws 401 - If authentication fails
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const strategy = (searchParams.get("strategy") || "A") as "A" | "B" | "C";
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (!["A", "B", "C"].includes(strategy)) {
    return NextResponse.json(
      { error: "Invalid strategy. Use one of: A, B, C" },
      { status: 400 },
    );
  }

  const wikiRoot = join(process.cwd(), "data", userId, "wiki");
  const result = findMergeCandidates(wikiRoot, { strategy, limit });

  return NextResponse.json({ candidates: result, count: result.length });
});
