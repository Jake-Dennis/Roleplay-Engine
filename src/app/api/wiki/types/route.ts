import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { addFolderToConfig, getResolvedFolderOrder } from "@/lib/wiki/config";
import { badRequestError, requireJson } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";
import fs from "fs";
import path from "path";

/**
 * POST /api/wiki/types
 * Creates a new wiki folder (and registers it in the config).
 *
 * The folder name is used both as the directory on disk and the source of
 * truth for the page `type` field (singular form). E.g. creating folder
 * "locations" implies pages inside have `type: location`.
 *
 * @param request - The incoming request with JSON body: { folderName, universeId }
 * @returns NextResponse with { folderOrder: string[] } (201)
 * @throws 400 - If folderName is missing, invalid, or a reserved name
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
  const { folderName, universeId } = body;

  if (typeof folderName !== "string" || !folderName.trim()) {
    return badRequestError("folderName is required and must be a non-empty string");
  }

  // Sanitize: lowercase, no special chars, no path separators
  const sanitized = folderName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) {
    return badRequestError("folderName must contain at least one alphanumeric character");
  }

  // Reserved names
  const reserved = [".wiki-config.json", "_review", "node_modules", ".git"];
  if (reserved.includes(sanitized) || sanitized.startsWith(".")) {
    return badRequestError(`folderName "${sanitized}" is reserved`);
  }

  const wikiRoot = getWikiRoot(userId, universeId);

  // Ensure wiki root exists
  if (!fs.existsSync(wikiRoot)) {
    fs.mkdirSync(wikiRoot, { recursive: true });
  }

  // Verify the resolved path is within the wiki root
  const folderPath = path.join(wikiRoot, sanitized);
  if (!folderPath.startsWith(path.resolve(wikiRoot))) {
    return badRequestError("Invalid folderName");
  }

  addFolderToConfig(wikiRoot, sanitized);
  // Re-resolve to include any existing custom folders
  const resolved = getResolvedFolderOrder(wikiRoot);

  return NextResponse.json(
    {
      folderName: sanitized,
      folderOrder: resolved,
    },
    { status: 201 },
  );
});
