import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import {
  listWikiPages,
  writeWikiPage,
  sanitizeWikiFilename,
  WikiFrontmatter,
} from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { findOrphans } from "@/lib/wiki/orphans";
import path from "path";
import fs from "fs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

  if (!fs.existsSync(wikiRoot)) {
    return NextResponse.json({ pages: [] });
  }

  const pages = listWikiPages(wikiRoot);
  const orphanPaths = findOrphans(wikiRoot);

  return NextResponse.json({
    pages: pages.map((p) => ({
      path: path.relative(wikiRoot, p.path).replace(/\\/g, "/"),
      content: p.content,
      frontmatter: p.frontmatter,
    })),
    orphanPaths,
  });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { path: pagePath, content, frontmatter } = body;

  if (!pagePath || content === undefined || !frontmatter) {
    return NextResponse.json(
      { error: "path, content, and frontmatter are required" },
      { status: 400 }
    );
  }

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

  // Sanitize filename from the last path segment
  const dir = path.dirname(pagePath);
  const base = path.basename(pagePath);
  const sanitizedBase = sanitizeWikiFilename(base);

  // Relative path with sanitized filename (e.g., "entities/haleth.md")
  const relativePath = dir === "." ? sanitizedBase : `${dir}/${sanitizedBase}`;
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(wikiRoot)) {
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
