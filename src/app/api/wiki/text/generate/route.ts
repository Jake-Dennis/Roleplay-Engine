import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { writeWikiPage } from "@/lib/wiki/file-io";
import { safeParseWarn } from "@/lib/safe-json";
import { getDb } from "@/lib/db";
import { registerEntity } from "@/lib/entity-registry";
import path from "path";
import type { WikiFrontmatter } from "@/lib/wiki/types";

/**
 * POST /api/wiki/text/generate
 * Generate a full wiki page from a user description.
 * Body: { prompt: string, userId: string, universeId?: string, type?: string, subtype?: string }
 * Returns: { path: string, title: string, type: string }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { prompt, universeId, type, subtype } = await request.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt field" }, { status: 400 });
  }

  const wikiRoot = getWikiRoot(userId, universeId);

  const raw = await generateText(PROMPTS.wikiGenerateFromPrompt(prompt), { userId, temperature: 0.7 });

  const parsed = safeParseWarn<{
    title: string;
    type: string;
    subtype?: string;
    content: string;
    tags?: string[];
  }>(raw, "wikiGenerateFromPrompt");

  if (!parsed || !parsed.title || !parsed.content) {
    return NextResponse.json(
      { error: "LLM output was not valid JSON. Try again.", raw },
      { status: 422 }
    );
  }

  const resolvedType = type || parsed.type || "concept";
  const resolvedSubtype = subtype || parsed.subtype || "";
  const folder = resolvedSubtype
    ? `${resolvedType}s/${resolvedSubtype}`
    : `${resolvedType}s`;
  const filename = `${parsed.title.toLowerCase().replace(/\s+/g, "_")}.md`;
  const pagePath = `${folder}/${filename}`;
  const now = new Date().toISOString();

  const frontmatter: WikiFrontmatter = {
    title: parsed.title,
    type: resolvedType,
    status: "draft",
    tags: parsed.tags || [],
    created: now,
    updated: now,
    universe: universeId || undefined,
  };

  const fullPath = path.join(wikiRoot, pagePath);

  // Auto-register entity for entity-type pages
  const SUBTYPE_TO_ENTITY_TYPE: Record<string, string> = {
    character: "npc", persona: "persona", npc: "npc",
    location: "location", event: "event", faction: "faction",
    item: "item", organization: "faction", object: "item",
  };
  if (resolvedType === "entity") {
    try {
      const tags = frontmatter.tags;
      const tagList = Array.isArray(tags) ? tags : [];
      const entityType = tagList.includes("persona") ? "persona" : (SUBTYPE_TO_ENTITY_TYPE[resolvedSubtype] || "npc");
      const entity = registerEntity(getDb(), userId, entityType, parsed.title, universeId || undefined);
      (frontmatter as Record<string, unknown>).entity_id = entity.id;
    } catch { /* non-fatal */ }
  }

  writeWikiPage(fullPath, parsed.content, frontmatter);

  return NextResponse.json(
    { path: pagePath, title: parsed.title, type: resolvedType },
    { status: 201 }
  );
});
