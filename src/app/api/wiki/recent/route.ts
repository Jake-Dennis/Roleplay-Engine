import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from '@/lib/auth-token';
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { readWikiPage } from "@/lib/wiki/file-io";
import { camelizeKeys } from "@/lib/response-utils";
import { serverError } from "@/lib/error-response";
import fs from "fs";
import path from "path";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);
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
