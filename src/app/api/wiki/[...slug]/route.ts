import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import {
  readWikiPage,
  writeWikiPage,
  deleteWikiPage,
  listWikiPages,
  WikiPage,
  WikiFrontmatter,
  ConflictError,
} from "@/lib/wiki/file-io";
// @deprecated: revisions.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { saveRevision } from "@/lib/wiki/revisions";
import { recordVersion, createSnapshotFile, getNextVersionNumber } from "@/lib/wiki/history";
import { generateIndex } from "@/lib/wiki/index-generator";
import { getDb } from "@/lib/db";
import { getEntity, registerEntity, deleteEntity } from "@/lib/entity-registry";
import { findOrphans } from "@/lib/wiki/orphans";
import { parseWikilinks, resolveWikilink } from "@/lib/wiki/wikilinks";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import path from "path";
import fs from "fs";
import { notFoundError, badRequestError, requireJson } from '@/lib/error-response';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Resolve the slug array to a relative file path within the wiki root.
 * Ensures the path ends with .md (appended if missing).
 * Joins parts with "/" for a clean relative path.
 */
function resolveSlugPath(slug: string[]): string {
  const joined = slug.join("/");
  return joined.endsWith(".md") ? joined : `${joined}.md`;
}

/**
 * Resolve a wiki page path with fuzzy search fallback for subtype subfolders.
 * Returns { fullPath, relativePath } or null if not found.
 *
 * If the exact slug path doesn't exist on disk, searches all wiki pages
 * for a filename match within the same top-level folder. This handles URLs
 * like /wiki/concepts/about finding concepts/lore/about.md after a page
 * was moved into a subtype subfolder during restructuring.
 */
function resolveWikiPagePath(
  wikiRoot: string,
  slug: string[]
): { fullPath: string; relativePath: string } | null {
  const relativePath = resolveSlugPath(slug);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) return null;

  if (fs.existsSync(fullPath)) {
    return { fullPath, relativePath };
  }

  // Fuzzy search: find page by filename within same top-level folder
  const allSearchPages = listWikiPages(wikiRoot);
  const normalizedTarget = relativePath.replace(/\\/g, "/").toLowerCase();
  const targetParts = normalizedTarget.split("/");
  const targetFilename = targetParts[targetParts.length - 1];
  const targetFolder = targetParts[0];

  const matches = allSearchPages
    .filter((p) => {
      const rel = path.relative(wikiRoot, p.path).replace(/\\/g, "/").toLowerCase();
      // Exact match or suffix match (original behavior)
      if (rel === normalizedTarget || rel.endsWith("/" + normalizedTarget)) return true;
      // Broader search: same filename under the same top-level folder
      // Handles pages moved into subtype subfolders (e.g., concepts/lore/about.md)
      const relParts = rel.split("/");
      return (
        relParts.length >= 2 &&
        relParts[0] === targetFolder &&
        relParts[relParts.length - 1] === targetFilename
      );
    })
    // Prefer the shallowest path (original location before subfolder move)
    .sort((a, b) => {
      const aDepth = path.relative(wikiRoot, a.path).split(path.sep).length;
      const bDepth = path.relative(wikiRoot, b.path).split(path.sep).length;
      return aDepth - bDepth;
    });

  if (matches.length === 0) return null;

  return {
    fullPath: matches[0].path,
    relativePath: path.relative(wikiRoot, matches[0].path).replace(/\\/g, "/"),
  };
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

/**
 * GET /api/wiki/[...slug]
 *
 * Retrieves a wiki page by its slug path, including parsed content, frontmatter,
 * backlinks, orphan detection, and embedded content.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id query param)
 * @param params - Route parameters containing the slug path segments
 * @returns NextResponse with { page, allPages, backlinks, orphanPaths, embeds }
 * @throws 400 - If the slug path is invalid or traverses outside the wiki root
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 500 - If reading or parsing the page fails
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const { slug } = await params;
  const wikiRoot = getWikiRoot(userId, universeId || undefined);

  const resolved = resolveWikiPagePath(wikiRoot, slug);
  if (!resolved) {
    return notFoundError("Wiki page");
  }
  const { fullPath, relativePath } = resolved;

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
      { content: string | null; frontmatter: Record<string, unknown> | null }
    > = {};

    for (const link of embedLinks) {
      if (seen.has(link.name)) continue;
      seen.add(link.name);

      const { pageName, section, blockId } = splitEmbedSpec(link.name);

      let targetContent: string | null = null;
      let targetFrontmatter: Record<string, unknown> | null = null;

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

    // Compute backlinks server-side (avoids exposing all page content to client)
    const backlinks: Array<{
      path: string;
      title: string;
      type: string;
      links: Array<{ name: string; context: string }>;
    }> = [];

    for (const p of allPages) {
      const pRelative = path.relative(wikiRoot, p.path).replace(/\\/g, "/");
      if (pRelative === relativePath) continue;

      const links = parseWikilinks(p.content);
      const matchingLinks = links.filter((link) => {
        const resolved = resolveWikilink(link.name, allPages, p.frontmatter.universe);
        return resolved === relativePath;
      });

      if (matchingLinks.length > 0) {
        backlinks.push({
          path: pRelative,
          title: p.frontmatter?.title || pRelative.split("/").pop()?.replace(".md", "") || "",
          type: p.frontmatter?.type || "concept",
          links: matchingLinks,
        });
      }
    }

    return NextResponse.json({
      page: {
        path: relativePath,
        content: page.content,
        frontmatter: page.frontmatter,
      },
      allPages: allPages.map((p) => ({
        path: path.relative(wikiRoot, p.path).replace(/\\/g, "/"),
        frontmatter: {
          title: p.frontmatter?.title,
          type: p.frontmatter?.type,
          status: p.frontmatter?.status,
          tags: p.frontmatter?.tags,
          universe: p.frontmatter?.universe,
        },
      })),
      backlinks,
      orphanPaths,
      embeds,
    });
  } catch (err: unknown) {
    logger.error("Failed to read wiki page", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 404 });
  }
}

/**
 * PUT /api/wiki/[...slug]
 *
 * Updates an existing wiki page. Supports partial updates — only content or frontmatter
 * can be provided. Performs concurrent edit detection via expectedLastModified timestamp.
 * Saves a revision snapshot before overwriting and regenerates the search index.
 *
 * @param request - The incoming Next.js request object with JSON body { content?, frontmatter?, expectedLastModified? }
 * @param params - Route parameters containing the slug path segments
 * @returns NextResponse with { success: true, path }
 * @throws 400 - If the slug path is invalid, body is malformed, or content exceeds size limit
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 409 - If a concurrent edit conflict is detected
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If writing or indexing fails
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  cleanupExpiredEntries();
  const limit = checkRateLimit(`wiki_write:${userId}`, "wiki_write");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

  const { slug } = await params;
  const wikiRoot = getWikiRoot(userId, universeId || undefined);

  const resolved = resolveWikiPagePath(wikiRoot, slug);
  if (!resolved) {
    return notFoundError("Wiki page");
  }
  const { fullPath, relativePath } = resolved;
  // Derive the canonical slug from the resolved path for consistent
  // revision storage (handles URL → actual path redirects)
  const resolvedSlug = relativePath.replace(/\\/g, "/").replace(/\.md$/i, "").split("/");

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
    saveRevision(wikiRoot, resolvedSlug, existing.content, existing.frontmatter);

    // Auto-register entity before writing: ensures every map-able wiki page
    // gets an entity_registry entry so it shows up in the entities page.
    const SUBTYPE_TO_ENTITY_TYPE: Record<string, string> = {
      character: "npc", persona: "persona", npc: "npc",
      location: "location", event: "event", faction: "faction",
      item: "item", organization: "faction", object: "item",
    };

    try {
      const existingEntityId = mergedFrontmatter.entity_id;
      const db = getDb();

      // Helper: determine entity type from wiki frontmatter.
      // Persona pages have tag "persona" but subtype "character" like NPCs.
      const resolvedEntityType = (subtype: string, tags?: string | string[]): string | null => {
        const tagList = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : [];
        if (tagList.includes("persona")) return "persona";
        return SUBTYPE_TO_ENTITY_TYPE[subtype] || null;
      };

      if (existingEntityId) {
        // Gap-fill: entity_id is set but registry entry doesn't exist yet
        const existing = getEntity(db, existingEntityId);
        if (!existing) {
          const subtype = mergedFrontmatter.subtype || "";
          const displayName = mergedFrontmatter.title || resolvedSlug;
          const entityType = resolvedEntityType(subtype, mergedFrontmatter.tags) || "npc";
          registerEntity(db, userId, entityType, displayName, mergedFrontmatter.universe || undefined);
        }
      } else {
        // No entity_id yet — auto-register if subtype maps to an entity type
        const subtype = mergedFrontmatter.subtype || "";
        const entityType = resolvedEntityType(subtype, mergedFrontmatter.tags);
        if (entityType) {
          const displayName = mergedFrontmatter.title || resolvedSlug;
          const entity = registerEntity(db, userId, entityType, displayName, mergedFrontmatter.universe || undefined);
          (mergedFrontmatter as Record<string, unknown>).entity_id = entity.id;
        }
      }
    } catch { /* non-fatal — entity registration should not block wiki save */ }

    writeWikiPage(fullPath, mergedContent, mergedFrontmatter as WikiFrontmatter, {
      expectedLastModified,
      onConflict: "fail",
    });

    // Record version in DB-backed history
    try {
      const rawContent = fs.readFileSync(fullPath, "utf-8");
      const snapshotPath = createSnapshotFile(wikiRoot, resolvedSlug, rawContent);
      const versionNumber = getNextVersionNumber(relativePath, userId);
      recordVersion(relativePath, userId, versionNumber, "", snapshotPath);
    } catch {
      // Non-critical: version history failure should not block the save
    }

    // Regenerate index
    generateIndex(wikiRoot);

    // Sync description/personality to linked personas
    try {
      const db = getDb();
      const linkedPersonas = db.prepare(
        "SELECT id, description FROM entity_registry WHERE id = ?"
      ).all(relativePath) as { id: string; description: string | null; personality: string | null }[];
      for (const persona of linkedPersonas) {
        // Extract description and personality from the saved wiki content
        const description = mergedContent.match(/## Description\n([\s\S]*?)(?=\n##|\n$|$)/)?.[1]?.trim();
        const personality = mergedContent.match(/## Personality\n([\s\S]*?)(?=\n##|\n$|$)/)?.[1]?.trim() ||
                           mergedContent.match(/\*\*Traits:\*\*([\s\S]*?)(?=\n##|\n$|\*\*)/)?.[1]?.trim();
        db.prepare(
          "UPDATE personas SET description = COALESCE(?, description), personality = COALESCE(?, personality) WHERE id = ?"
        ).run(description || null, personality || null, persona.id);
      }
    } catch { /* non-fatal */ }

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
    logger.error("Failed to update wiki page", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/wiki/[...slug]
 *
 * Deletes a wiki page by its slug path. Regenerates the search index after deletion.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id query param)
 * @param params - Route parameters containing the slug path segments
 * @returns NextResponse with { success: true }
 * @throws 400 - If the slug path is invalid or traverses outside the wiki root
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 500 - If deletion or index regeneration fails
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const { slug } = await params;
  const wikiRoot = getWikiRoot(userId, universeId || undefined);

  const resolved = resolveWikiPagePath(wikiRoot, slug);
  if (!resolved) {
    return notFoundError("Wiki page");
  }
  const { fullPath } = resolved;

  // Read frontmatter before deletion to clean up entity registry
  let entityId: string | undefined;
  try {
    const page = readWikiPage(fullPath);
    entityId = page.frontmatter.entity_id;
  } catch {
    // Non-fatal — if we can't read the page, still attempt deletion
  }

  try {
    // Clean up entity registry if this page had a linked entity
    if (entityId) {
      const db = getDb();
      const removed = deleteEntity(db, entityId);
      if (removed) {
        logger.info(`Deleted entity ${entityId} from registry (wiki page deleted)`);
      } else {
        // Entity still referenced by other tables (relationships, personas, etc.)
        // This is expected — keep the entity, just delete the page
        logger.debug(`Entity ${entityId} kept — still referenced elsewhere`);
      }
    }

    deleteWikiPage(fullPath);

    // Regenerate index
    generateIndex(wikiRoot);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logger.error("Failed to delete wiki page", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
