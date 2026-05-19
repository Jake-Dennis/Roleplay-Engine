import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { APP_CONFIG } from "@/lib/config";
import {
  listWikiPages,
  writeWikiPage,
  sanitizeWikiFilename,
  WikiFrontmatter,
} from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { findOrphans, getOrphanSuggestions } from "@/lib/wiki/orphans";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import path from "path";
import fs from "fs";

export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const wikiRoot = path.join(APP_CONFIG.dataDir, userId, "wiki");

  if (!fs.existsSync(wikiRoot)) {
    return NextResponse.json({ pages: [] });
  }

  const pages = listWikiPages(wikiRoot);
  const orphanPaths = findOrphans(wikiRoot);
  const orphanSuggestions = getOrphanSuggestions(orphanPaths, pages);
  const suggestionsObj: Record<string, string[]> = {};
  for (const [orphanPath, suggestions] of orphanSuggestions) {
    suggestionsObj[orphanPath] = suggestions.map(s => path.relative(wikiRoot, s).replace(/\\/g, "/"));
  }

  return NextResponse.json({
    pages: pages.map((p) => ({
      path: path.relative(wikiRoot, p.path).replace(/\\/g, "/"),
      content: p.content,
      frontmatter: p.frontmatter,
    })),
    orphanPaths,
    orphanSuggestions: suggestionsObj,
  });
}

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const body = await request.json();
  const { path: pagePath, content, frontmatter } = body;

  if (!pagePath || content === undefined || !frontmatter) {
    return NextResponse.json(
      { error: "path, content, and frontmatter are required" },
      { status: 400 }
    );
  }

  const wikiRoot = path.join(APP_CONFIG.dataDir, userId, "wiki");

  // Sanitize filename from the last path segment
  const dir = path.dirname(pagePath);
  const base = path.basename(pagePath);
  const sanitizedBase = sanitizeWikiFilename(base);

  // Relative path with sanitized filename (e.g., "entities/haleth.md")
  const relativePath = dir === "." ? sanitizedBase : `${dir}/${sanitizedBase}`;
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  writeWikiPage(fullPath, content, frontmatter as WikiFrontmatter);

  // Regenerate index
  generateIndex(wikiRoot);

  return NextResponse.json({
    success: true,
    path: relativePath.replace(/\\/g, "/"),
  });
}
