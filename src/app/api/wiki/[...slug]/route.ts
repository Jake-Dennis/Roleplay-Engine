import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import {
  readWikiPage,
  writeWikiPage,
  deleteWikiPage,
  listWikiPages,
  WikiPage,
  WikiFrontmatter,
  ConflictError,
} from "@/lib/wiki/file-io";
import { saveRevision } from "@/lib/wiki/revisions";
import { generateIndex } from "@/lib/wiki/index-generator";
import { findOrphans } from "@/lib/wiki/orphans";
import { parseWikilinks } from "@/lib/wiki/wikilinks";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import path from "path";
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';
import { unauthorizedError, notFoundError, badRequestError, requireJson } from '@/lib/error-response';
import { validateLength } from '@/lib/validation';

/**
 * Resolve the slug array to a relative file path within the wiki root.
 * Ensures the path ends with .md (appended if missing).
 * Joins parts with "/" for a clean relative path.
 */
function resolveSlugPath(slug: string[]): string {
  const joined = slug.join("/");
  return joined.endsWith(".md") ? joined : `${joined}.md`;
}

// ---------------------------------------------------------------------------
// Embed helpers
// ---------------------------------------------------------------------------

/**
 * Split an embed target name into its components.
 * "Page#Heading"       → { pageName: "Page", section: "Heading", blockId: null }
 * "Page#^block-id"     → { pageName: "Page", section: null, blockId: "block-id" }
 * "#Heading"           → { pageName: null, section: "Heading", blockId: null }
 * "#^block-id"         → { pageName: null, section: null, blockId: "block-id" }
 * "Page"               → { pageName: "Page", section: null, blockId: null }
 */
function splitEmbedSpec(
  name: string
): { pageName: string | null; section: string | null; blockId: string | null } {
  if (name.startsWith("#")) {
    const spec = name.slice(1);
    if (spec.startsWith("^")) return { pageName: null, section: null, blockId: spec.slice(1) };
    return { pageName: null, section: spec, blockId: null };
  }
  const hashIdx = name.indexOf("#");
  if (hashIdx === -1) return { pageName: name, section: null, blockId: null };
  const pageName = name.slice(0, hashIdx);
  const spec = name.slice(hashIdx + 1);
  if (spec.startsWith("^")) return { pageName, section: null, blockId: spec.slice(1) };
  return { pageName, section: spec, blockId: null };
}

/**
 * Find a WikiPage by name, matching on frontmatter title or filename.
 * Supports Universe::Page notation and .md extension.
 */
function findPageByName(
  name: string,
  pages: WikiPage[]
): WikiPage | undefined {
  let norm = name.trim().toLowerCase().replace(/\s+/g, "-");
  if (norm.endsWith(".md")) norm = norm.slice(0, -3);

  // Handle Universe::Page notation
  let universeFilter: string | undefined;
  if (norm.includes("::")) {
    const parts = norm.split("::");
    universeFilter = parts[0].trim();
    norm = parts.slice(1).join("::").trim();
  }

  for (const p of pages) {
    const t = (p.frontmatter.title || "").toLowerCase().replace(/\s+/g, "-");
    const u = (p.frontmatter.universe || "").toLowerCase();
    if (t === norm && (!universeFilter || u === universeFilter)) return p;
  }
  for (const p of pages) {
    const f = path.basename(p.path, ".md").toLowerCase();
    const u = (p.frontmatter.universe || "").toLowerCase();
    if (f === norm && (!universeFilter || u === universeFilter)) return p;
  }
  return undefined;
}

/**
 * Extract content from a heading down to the next heading of same or higher level.
 * Returns empty string if heading not found.
 */
function extractSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const lower = heading.toLowerCase();
  let startIdx = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (m && m[2].toLowerCase() === lower) {
      startIdx = i;
      level = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return "";
  const result: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) break;
    result.push(lines[i]);
  }
  return result.join("\n").trim();
}

/**
 * Extract a single block identified by ^block-id.
 * Handles paragraphs, code blocks, and list items.
 */
function extractBlock(content: string, blockId: string): string {
  const lines = content.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`^${blockId}`)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return "";

  const marker = `^${blockId}`;

  // Code block
  if (lines[idx].trim().startsWith("```")) {
    let end = idx + 1;
    while (end < lines.length && !lines[end].trim().startsWith("```")) end++;
    if (end < lines.length) end++;
    return lines
      .slice(idx, end)
      .map((l) => l.replace(marker, "").trimEnd())
      .join("\n")
      .trim();
  }

  // Find paragraph boundaries (backward/forward until blank line or heading)
  let start = idx;
  while (start > 0 && lines[start - 1].trim() !== "" && !/^#{1,6}\s/.test(lines[start - 1])) {
    start--;
  }
  let end = idx;
  while (end + 1 < lines.length && lines[end + 1].trim() !== "" && !/^#{1,6}\s/.test(lines[end + 1])) {
    end++;
  }

  return lines
    .slice(start, end + 1)
    .map((l) => l.replace(marker, "").trimEnd())
    .join("\n")
    .trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const relativePath = resolveSlugPath(slug);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return badRequestError("Invalid path");
  }

  if (!fs.existsSync(fullPath)) {
    return notFoundError("Wiki page");
  }

  try {
    const page = readWikiPage(fullPath);
    const allPages = listWikiPages(wikiRoot);
    const orphanPaths = findOrphans(wikiRoot);

    // Parse embeds: find all ![[...]] and fetch target page content
    const links = parseWikilinks(page.content);
    const embedLinks = links.filter((l) => l.isEmbed);

    // Deduplicate by name
    const seen = new Set<string>();
    const embeds: Record<
      string,
      { content: string | null; frontmatter: Record<string, any> | null }
    > = {};

    for (const link of embedLinks) {
      if (seen.has(link.name)) continue;
      seen.add(link.name);

      const { pageName, section, blockId } = splitEmbedSpec(link.name);

      let targetContent: string | null = null;
      let targetFrontmatter: Record<string, any> | null = null;

      if (!pageName) {
        // Current-page embed (#Heading or #^block-id)
        targetContent = page.content;
        targetFrontmatter = page.frontmatter;
        if (section) {
          targetContent = extractSection(targetContent, section);
        } else if (blockId) {
          targetContent = extractBlock(targetContent, blockId);
        }
      } else {
        // Cross-page embed — find the page in allPages
        const targetPage = findPageByName(pageName, allPages);
        if (targetPage) {
          try {
            const fresh = readWikiPage(targetPage.path);
            targetContent = fresh.content;
            targetFrontmatter = fresh.frontmatter;

            if (section) {
              targetContent = extractSection(targetContent, section);
            } else if (blockId) {
              targetContent = extractBlock(targetContent, blockId);
            }
          } catch {
            // readWikiPage threw — file missing between listWikiPages and now
            targetContent = null;
            targetFrontmatter = null;
          }
        } else {
          // Page not found by title/filename
          targetContent = null;
          targetFrontmatter = null;
        }
      }

      embeds[link.name] = { content: targetContent, frontmatter: targetFrontmatter };
    }

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
      embeds,
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
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const relativePath = resolveSlugPath(slug);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return badRequestError("Invalid path");
  }

  if (!fs.existsSync(fullPath)) {
    return notFoundError("Wiki page");
  }

    requireJson(request);
    const body = await request.json();
  const { content, frontmatter, expectedLastModified } = body;

  if (content === undefined && !frontmatter) {
    return NextResponse.json(
      { error: "At least one of content or frontmatter is required" },
      { status: 400 }
    );
  }

  if (content !== undefined) {
    const contentError = validateLength(content, 100000, "Content");
    if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });
  }

  try {
    // Read existing page to merge partial updates
    const existing = readWikiPage(fullPath);
    const mergedContent = content !== undefined ? content : existing.content;
    const mergedFrontmatter = frontmatter
      ? { ...existing.frontmatter, ...frontmatter }
      : (existing.frontmatter as WikiFrontmatter);

    // Save revision snapshot before overwriting
    saveRevision(wikiRoot, slug, existing.content, existing.frontmatter);

    writeWikiPage(fullPath, mergedContent, mergedFrontmatter as WikiFrontmatter, {
      expectedLastModified,
      onConflict: "fail",
    });

    // Regenerate index
    generateIndex(wikiRoot);

    return NextResponse.json({
      success: true,
      path: relativePath,
    });
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { error: "Concurrent edit conflict", existingLastModified: err.existingLastModified },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const relativePath = resolveSlugPath(slug);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return badRequestError("Invalid path");
  }

  if (!fs.existsSync(fullPath)) {
    return notFoundError("Wiki page");
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
