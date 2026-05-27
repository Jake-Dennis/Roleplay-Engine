import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { ingestSource } from "@/lib/wiki/ingest";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import path from "path";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { serverError, requireJson } from '@/lib/error-response';

/**
 * POST /api/wiki/ingest
 *
 * Ingests an external source file (e.g., markdown, text) into the wiki by parsing
 * its content and creating or updating wiki pages via the LLM.
 *
 * @param request - The incoming Next.js request object with JSON body { sourcePath, universeId }
 * @returns NextResponse with { success: true, created, updated, errors }
 * @throws 400 - If sourcePath or universeId is missing, or path traverses outside wiki root
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the ingestion process fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  cleanupExpiredEntries();
  const limit = checkRateLimit(`generate:${userId}`, "generate");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { sourcePath, universeId } = body;

  if (!sourcePath || !universeId) {
    return NextResponse.json(
      { error: "sourcePath and universeId are required" },
      { status: 400 }
    );
  }

  const wikiRoot = getWikiRoot(userId, universeId);

  // Resolve sourcePath relative to wikiRoot and verify it stays within bounds
  const resolvedPath = path.resolve(wikiRoot, sourcePath);
  if (!isPathWithinRoot(resolvedPath, wikiRoot)) {
    return NextResponse.json(
      { error: "sourcePath must be a relative path within the wiki directory" },
      { status: 400 }
    );
  }

  try {
    const result = await ingestSource(sourcePath, wikiRoot, universeId);
    return NextResponse.json({
      success: true,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (err: unknown) {
    return serverError(err);
  }
}
