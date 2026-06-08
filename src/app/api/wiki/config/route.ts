import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { readWikiConfig, getResolvedFolderOrder } from "@/lib/wiki/config";
import { getTypeRegistry } from "@/lib/wiki/type-registry";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";

/**
 * GET /api/wiki/config
 * Returns the wiki configuration for a universe: folder display order, types, etc.
 *
 * @param request - The incoming request with query param: universe_id
 * @returns NextResponse with { folderOrder, customFolderOrder, types, subtypeFolders }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || undefined;
  const wikiRoot = getWikiRoot(userId, universeId);

  const config = readWikiConfig(wikiRoot);
  const resolvedOrder = getResolvedFolderOrder(wikiRoot);
  const registry = getTypeRegistry(wikiRoot);

  // Build a flat list of known subtypes from the type registry
  const allSubtypes: string[] = [];
  for (const typeDef of Object.values(registry.types)) {
    for (const subtype of typeDef.subtypes) {
      if (!allSubtypes.includes(subtype)) allSubtypes.push(subtype);
    }
  }

  return NextResponse.json({
    folderOrder: resolvedOrder,
    customFolderOrder: config.folderOrder,
    types: registry.types,
    subtypeFolders: registry.subtypeFolders,
    subtypes: allSubtypes,
  });
});
