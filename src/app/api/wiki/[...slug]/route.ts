import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import {
  readWikiPage,
  writeWikiPage,
  deleteWikiPage,
  listWikiPages,
  WikiFrontmatter,
} from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { findOrphans } from "@/lib/wiki/orphans";
import path from "path";
import fs from "fs";

/**
 * Resolve the slug array to a relative file path within the wiki root.
 * Ensures the path ends with .md (appended if missing).
 * Joins parts with "/" for a clean relative path.
 */
function resolveSlugPath(slug: string[]): string {
  const joined = slug.join("/");
  return joined.endsWith(".md") ? joined : `${joined}.md`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const relativePath = resolveSlugPath(slug);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  try {
    const page = readWikiPage(fullPath);
    const allPages = listWikiPages(wikiRoot);
    const orphanPaths = findOrphans(wikiRoot);
    return NextResponse.json({
      page: {
        path: relativePath,
        content: page.content,
        frontmatter: page.frontmatter,
      },
      allPages: allPages.map((p) => ({
        path: path.relative(wikiRoot, p.path).replace(/\\/g, "/"),
        content: p.content,
        frontmatter: p.frontmatter,
      })),
      orphanPaths,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const relativePath = resolveSlugPath(slug);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  const body = await request.json();
  const { content, frontmatter } = body;

  if (content === undefined && !frontmatter) {
    return NextResponse.json(
      { error: "At least one of content or frontmatter is required" },
      { status: 400 }
    );
  }

  try {
    // Read existing page to merge partial updates
    const existing = readWikiPage(fullPath);
    const mergedContent = content !== undefined ? content : existing.content;
    const mergedFrontmatter = frontmatter
      ? { ...existing.frontmatter, ...frontmatter }
      : (existing.frontmatter as WikiFrontmatter);

    writeWikiPage(fullPath, mergedContent, mergedFrontmatter as WikiFrontmatter);

    // Regenerate index
    generateIndex(wikiRoot);

    return NextResponse.json({
      success: true,
      path: relativePath,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const relativePath = resolveSlugPath(slug);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  try {
    deleteWikiPage(fullPath);

    // Regenerate index
    generateIndex(wikiRoot);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
