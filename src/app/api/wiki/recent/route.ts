import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { readWikiPage } from "@/lib/wiki/file-io";
import { camelizeKeys } from "@/lib/response-utils";
import { serverError } from "@/lib/error-response";
import fs from "fs";
import path from "path";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki/recent
 *
 * Returns the most recently modified wiki pages within a universe, sorted by
 * modification time descending.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id and ?limit query params)
 * @returns NextResponse with { files: Array<{ path, mtime, title, universe }> }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If scanning wiki files fails
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  if (!fs.existsSync(wikiRoot)) {
    return NextResponse.json({ files: [] });
  }

  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10", 10);

  try {
    const recentFiles: Array<{ path: string; mtime: number; title: string; universe: string }> = [];

    function scanDir(dir: string, universe: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip internal wiki folders
          if (entry.name === "_review") continue;
          scanDir(fullPath, universe || entry.name);
        } else if (entry.name.endsWith(".md")) {
          const stat = fs.statSync(fullPath);
          try {
            const page = readWikiPage(fullPath);
            recentFiles.push({
              path: fullPath.replace(wikiRoot + path.sep, ""),
              mtime: stat.mtimeMs,
              title: page.frontmatter.title || entry.name,
              universe,
            });
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    scanDir(wikiRoot, "");
    recentFiles.sort((a, b) => b.mtime - a.mtime);

    return NextResponse.json({ files: camelizeKeys(recentFiles.slice(0, limit)) });
  } catch (err: unknown) {
    return serverError(err);
  }
}
