import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import {
  listWikiPages,
  writeWikiPage,
  sanitizeWikiFilename,
  WikiFrontmatter,
} from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { findOrphans, getOrphanSuggestions } from "@/lib/wiki/orphans";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { badRequestError, requireJson } from "@/lib/error-response";
import { validateLength } from '@/lib/validation';
import { getDb } from "@/lib/db";
import { getEntity, registerEntity } from "@/lib/entity-registry";
import path from "path";
import fs from "fs";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki
 * Lists all wiki pages for a universe, including orphan detection and suggestions.
 *
 * @param request - The incoming Next.js request with query param: universe_id
 * @returns NextResponse with { pages, orphanPaths, orphanSuggestions } â€” each page has path, content, frontmatter
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const universeId = request.nextUrl.searchParams.get("universe_id") || "";
const wikiRoot = getWikiRoot(userId, universeId || undefined);

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
}); });

/**
 * POST /api/wiki
 * Creates or updates a wiki page. Sanitizes filenames, prevents path traversal,
 * and regenerates the universe index after writing.
 *
 * @param request - The incoming Next.js request with JSON body: { path, content, frontmatter, universeId }
 * @returns NextResponse with { success, path } (201)
 * @throws 400 - If path, content, or frontmatter are missing; content exceeds 100k chars; or path traversal detected
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { path: pagePath, content, frontmatter, universeId: bodyUniverseId } = body;
const fm = frontmatter as Record<string, unknown> | undefined;
const universeId = bodyUniverseId || (fm?.universe as string) || "";

if (!pagePath || content === undefined || !frontmatter) {
  return badRequestError("path, content, and frontmatter are required");
}

const contentError = validateLength(content, 100000, "Content");
if (contentError) return badRequestError(contentError);

const wikiRoot = getWikiRoot(userId, universeId);

// Sanitize filename from the last path segment
const dir = path.dirname(pagePath);
// Security: reject path traversal sequences
if (dir.includes("..") || pagePath.includes("..")) {
  return badRequestError("Invalid path: path traversal is not allowed");
}
const base = path.basename(pagePath);
const sanitizedBase = sanitizeWikiFilename(base);

// Relative path with sanitized filename (e.g., "entities/haleth.md")
const relativePath = dir === "." ? sanitizedBase : `${dir}/${sanitizedBase}`;
const normalizedPath = path.normalize(relativePath);
const fullPath = path.join(wikiRoot, normalizedPath);

// Security: prevent path traversal
if (!isPathWithinRoot(fullPath, wikiRoot)) {
  return badRequestError("Invalid path");
}

// Auto-register entity before writing the page: creates an entity_registry entry
// and embeds the entity_id into the page frontmatter so the entities page shows it.
const SUBTYPE_TO_ENTITY_TYPE: Record<string, string> = {
  character: "npc", persona: "persona", npc: "npc",
  location: "location", event: "event", faction: "faction",
  item: "item", organization: "faction", object: "item",
};

try {
  const fm = frontmatter as Record<string, unknown>;
  const existingEntityId = fm.entity_id as string | undefined;
  const db = getDb();

  // Helper: determine entity type from wiki frontmatter.
  // If tags include "persona", force entity type to "persona"
  // (personas use subtype:character like NPCs, but need a different type).
  const resolveEntityType = (subtype: string, tags?: unknown): string | null => {
    const tagList = Array.isArray(tags) ? tags as string[] : [];
    if (tagList.includes("persona")) return "persona";
    return SUBTYPE_TO_ENTITY_TYPE[subtype] || null;
  };

  if (existingEntityId) {
    // Gap-fill: entity_id is set in frontmatter but entry doesn't exist yet
    const existing = getEntity(db, existingEntityId);
    if (!existing) {
      const subtype = (fm.subtype as string) || "";
      const displayName = (fm.title as string) || path.basename(pagePath, ".md");
      const entityType = resolveEntityType(subtype, fm.tags) || "npc";
      registerEntity(db, userId, entityType, displayName, universeId || undefined);
    }
  } else {
    // New page with no entity_id — auto-register if subtype maps to an entity type
    const subtype = (fm.subtype as string) || "";
    const entityType = resolveEntityType(subtype, fm.tags);
    if (entityType) {
      const displayName = (fm.title as string) || path.basename(pagePath, ".md");
      const entity = registerEntity(db, userId, entityType, displayName, universeId || undefined);
      (fm as Record<string, unknown>).entity_id = entity.id;
    }
  }
} catch { /* non-fatal — entity registration should not block wiki save */ }

writeWikiPage(fullPath, content, frontmatter as WikiFrontmatter);

// Regenerate index
generateIndex(wikiRoot);

return NextResponse.json({
  success: true,
  path: relativePath.replace(/\\/g, "/"),
}); });
