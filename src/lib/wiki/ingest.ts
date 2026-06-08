import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { writeWikiPage, sanitizeWikiFilename, WikiFrontmatter } from "./file-io";
import { getTypeRegistry } from "./type-registry";
import { folderForPage } from "./subtype-folders";
import { generateIndex } from "./index-generator";
// @deprecated: logger.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { appendLog } from "./logger";
import { generateText } from "@/lib/ollama";
import { logger } from '@/lib/logger';
import { CONTENT_LIMITS } from "@/lib/config";
import { safeParseWarn } from "@/lib/safe-json";

/**
 * Result of an ingest operation.
 */
export interface IngestResult {
  created: string[];
  updated: string[];
  errors: string[];
}

/** Allowed sub-types for entities. */
const ENTITY_SUBTYPES = ["character", "location", "item", "faction", "organization", "creature"] as const;

/** Allowed sub-types for concepts. */
const CONCEPT_SUBTYPES = ["theme", "rule", "mechanic", "lore", "event", "tradition"] as const;

/**
 * Extracted entity or concept from a source file.
 */
interface ExtractedItem {
  title: string;
  type: "entity" | "concept";
  subtype?: (typeof ENTITY_SUBTYPES | typeof CONCEPT_SUBTYPES)[number];
  description: string;
  tags: string[];
}

/**
 * Parsed result from the LLM extraction prompt.
 */
interface ExtractionResult {
  entities: ExtractedItem[];
  concepts: ExtractedItem[];
}

// ---------------------------------------------------------------------------
// Source Reading
// ---------------------------------------------------------------------------

/**
 * Read the raw content of a source file.
 * Supports .txt, .md, and other text-based formats.
 */
function readSourceFile(sourcePath: string): string {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  return fs.readFileSync(sourcePath, "utf-8");
}

// ---------------------------------------------------------------------------
// LLM Extraction
// ---------------------------------------------------------------------------

/**
 * Use the LLM to extract entities and concepts from source content.
 * Returns structured extraction with titles, types, descriptions, and tags.
 */
async function extractFromSource(
  sourceContent: string,
  sourceFilename: string
): Promise<ExtractionResult> {
  // Truncate very large sources to fit context window
  const truncated = sourceContent.length > 12000
    ? sourceContent.slice(0, 12000) + "\n\n... [truncated]"
    : sourceContent;

  const prompt = `You are extracting structured wiki data from a source document for a roleplay universe.

Source file: ${sourceFilename}

Source content:
---
${truncated}
---

Extract all meaningful entities and concepts from this source.

Entity types: characters, locations, items, factions, organizations, creatures.
Concept types: themes, rules, mechanics, lore, events, traditions.

For each item, also determine the most specific subtype:
- Entity subtypes: "character", "location", "item", "faction", "organization", "creature"
- Concept subtypes: "theme", "rule", "mechanic", "lore", "event", "tradition"

Return ONLY a valid JSON object with this exact structure:
{
  "entities": [
    {
      "title": "Name of the entity",
      "type": "entity",
      "subtype": "character",
      "description": "A concise but informative description (2-4 sentences) capturing key details from the source",
      "tags": ["tag1", "tag2"]
    }
  ],
  "concepts": [
    {
      "title": "Name of the concept",
      "type": "concept",
      "subtype": "lore",
      "description": "A concise but informative description (2-4 sentences) capturing key details from the source",
      "tags": ["tag1", "tag2"]
    }
  ]
}

Rules:
- Extract ONLY what is explicitly present in the source — do not invent or infer beyond what is written.
- Each description should be substantive enough to serve as a wiki page body.
- Tags should be short, lowercase keywords relevant to the item.
- Select the most specific subtype that fits. If unsure, omit "subtype" entirely.
- If nothing of a type is found, return an empty array for that type.
- Return ONLY the JSON object, no markdown fences, no explanation.`;

  try {
    const response = await generateText(prompt, {
      temperature: 0.3,
    });

    // Extract JSON from response (handle potential markdown fences)
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = safeParseWarn<ExtractionResult>(jsonStr, "LLM extraction response");
    if (!parsed) return { entities: [], concepts: [] };

    // Validate and normalize
    function validateSubtype(
      subtype: unknown,
      valid: readonly string[]
    ): string | undefined {
      if (typeof subtype !== "string") return undefined;
      return valid.includes(subtype) ? subtype : undefined;
    }

    const entities = (parsed.entities || [])
      .filter((e) => e.title && e.description)
      .map((e) => ({
        ...e,
        type: "entity" as const,
        subtype: validateSubtype(e.subtype, ENTITY_SUBTYPES) as (typeof ENTITY_SUBTYPES)[number] | undefined,
        tags: Array.isArray(e.tags) ? e.tags : [],
      }));

    const concepts = (parsed.concepts || [])
      .filter((c) => c.title && c.description)
      .map((c) => ({
        ...c,
        type: "concept" as const,
        subtype: validateSubtype(c.subtype, CONCEPT_SUBTYPES) as (typeof CONCEPT_SUBTYPES)[number] | undefined,
        tags: Array.isArray(c.tags) ? c.tags : [],
      }));

    return { entities, concepts };
  } catch (err: unknown) {
    // LLM failed — return empty extraction, caller handles gracefully
    logger.error("[ingest] LLM extraction failed:", err);
    return { entities: [], concepts: [] };
  }
}

// ---------------------------------------------------------------------------
// Page Creation
// ---------------------------------------------------------------------------

/**
 * Build frontmatter for a new wiki page.
 */
function buildFrontmatter(
  title: string,
  type: WikiFrontmatter["type"],
  universeId: string,
  tags: string[],
  sourceRef: string,
  subtype?: string
): WikiFrontmatter {
  return {
    title,
    type,
    subtype: subtype as WikiFrontmatter["subtype"] | undefined,
    status: "draft",
    universe: universeId,
    tags: [...tags, "auto-generated", `source:${sourceRef}`],
    created: new Date().toISOString(),
  };
}

/**
 * Create or update a wiki page for an extracted item.
 * Returns { action: "created" | "updated", path: string } or null on error.
 */
function createWikiPageForItem(
  item: ExtractedItem,
  wikiRoot: string,
  universeId: string,
  sourceRef: string
): { action: "created" | "updated"; pagePath: string } | null {
  try {
    // Use registry-driven folder resolution (supports 2-level structure)
    const registry = getTypeRegistry(wikiRoot);
    const frontmatter = { type: item.type, subtype: item.subtype };
    const folder = folderForPage(frontmatter, registry);
    const filename = sanitizeWikiFilename(item.title);
    const pagePath = path.join(wikiRoot, folder, filename);

    // Check if page already exists
    const exists = fs.existsSync(pagePath);

    if (exists) {
      // Read existing page and append new info
      const raw = fs.readFileSync(pagePath, "utf-8");
      const { data, content } = matter(raw);

      // Append source reference to existing content
      const updatedContent = content.trimEnd() +
        `\n\n---\n\n*Additional information sourced from [[${sourceRef}]]:*\n\n${item.description}`;

      // Update frontmatter tags
      const existingTags = Array.isArray(data.tags) ? data.tags : [];
      const newTags = [...new Set([...existingTags, ...item.tags, `source:${sourceRef}`])];

      const frontmatter: WikiFrontmatter = {
        title: data.title || item.title,
        type: data.type || item.type,
        subtype: (item.subtype && !data.subtype)
          ? (item.subtype as WikiFrontmatter["subtype"])
          : (data.subtype || undefined),
        status: data.status || "draft",
        universe: data.universe || universeId,
        tags: newTags as string[],
        created: data.created || new Date().toISOString(),
      };

      writeWikiPage(pagePath, updatedContent, frontmatter);
      return { action: "updated", pagePath };
    }

    // Create new page
    const newFrontmatter = buildFrontmatter(item.title, item.type, universeId, item.tags, sourceRef, item.subtype);
    const body = item.description;

    writeWikiPage(pagePath, body, newFrontmatter);
    return { action: "created", pagePath };
  } catch (err: unknown) {
    logger.error(`[ingest] Failed to create page for "${item.title}":`, err);
    return null;
  }
}

/**
 * Create a source page that references the original source file.
 */
function createSourcePage(
  sourcePath: string,
  sourceContent: string,
  wikiRoot: string,
  universeId: string
): { pagePath: string } | null {
  try {
    const registry = getTypeRegistry(wikiRoot);
    const folderFrontmatter = { type: "source" };
    const folder = folderForPage(folderFrontmatter, registry);
    const filename = sanitizeWikiFilename(path.basename(sourcePath, path.extname(sourcePath)));
    const pagePath = path.join(wikiRoot, folder, filename);

    // Check if source page already exists
    if (fs.existsSync(pagePath)) {
      return { pagePath };
    }

    const sourceFrontmatter: WikiFrontmatter = {
      title: path.basename(sourcePath, path.extname(sourcePath)),
      type: "source",
      status: "draft",
      universe: universeId,
      tags: ["source-material"],
      created: new Date().toISOString(),
    };

    // Truncate body for source page — store reference, not full content
    const preview = sourceContent.length > CONTENT_LIMITS.MEDIUM
      ? sourceContent.slice(0, CONTENT_LIMITS.MEDIUM) + "\n\n... [full content in original file]"
      : sourceContent;

    const body = `Source material ingested from:\n\`${sourcePath}\`\n\n---\n\n${preview}`;

    writeWikiPage(pagePath, body, sourceFrontmatter);
    return { pagePath };
  } catch (err: unknown) {
    logger.error(`[ingest] Failed to create source page for "${sourcePath}":`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main Ingest Function
// ---------------------------------------------------------------------------

/**
 * Process a source file into wiki pages.
 *
 * Flow:
 * 1. Read the source file
 * 2. Create a source page in sources/
 * 3. Use LLM to extract entities and concepts
 * 4. Create/update wiki pages in entities/ and concepts/
 * 5. Regenerate the wiki index
 * 6. Append to the operation log
 *
 * @param sourcePath - Absolute or relative path to the source file
 * @param wikiRoot - Absolute path to the wiki root directory
 * @param universeId - Universe scope identifier
 * @returns IngestResult with created pages, updated pages, and errors
 */
export async function ingestSource(
  sourcePath: string,
  wikiRoot: string,
  universeId: string
): Promise<IngestResult> {
  const result: IngestResult = {
    created: [],
    updated: [],
    errors: [],
  };

  // Ensure wiki root exists
  if (!fs.existsSync(wikiRoot)) {
    result.errors.push(`Wiki root does not exist: ${wikiRoot}`);
    return result;
  }

  // Step 1: Read source file
  let sourceContent: string;
  try {
    sourceContent = readSourceFile(sourcePath);
  } catch (err: unknown) {
    result.errors.push(`Failed to read source file: ${(err as Error).message}`);
    return result;
  }

  if (!sourceContent.trim()) {
    result.errors.push("Source file is empty");
    return result;
  }

  const sourceRef = path.basename(sourcePath, path.extname(sourcePath));

  // Step 2: Create source page
  const sourcePage = createSourcePage(sourcePath, sourceContent, wikiRoot, universeId);
  if (sourcePage) {
    result.created.push(sourcePage.pagePath);
  } else {
    result.errors.push("Failed to create source page");
  }

  // Step 3: Extract entities and concepts via LLM
  const extraction = await extractFromSource(sourceContent, sourceRef);

  // Step 4: Create wiki pages for extracted items
  const allItems = [...extraction.entities, ...extraction.concepts];

  for (const item of allItems) {
    const pageResult = createWikiPageForItem(item, wikiRoot, universeId, sourceRef);
    if (pageResult) {
      if (pageResult.action === "created") {
        result.created.push(pageResult.pagePath);
      } else {
        result.updated.push(pageResult.pagePath);
      }
    } else {
      result.errors.push(`Failed to create page for: ${item.title}`);
    }
  }

  // Step 5: Regenerate wiki index
  try {
    generateIndex(wikiRoot);
  } catch (err: unknown) {
    result.errors.push(`Failed to regenerate index: ${(err as Error).message}`);
  }

  // Step 6: Append to operation log
  try {
    const details = `Source: ${sourcePath}\nCreated: ${result.created.length} pages\nUpdated: ${result.updated.length} pages\nErrors: ${result.errors.length}`;
    appendLog(wikiRoot, "ingest", sourceRef, details);
  } catch (err: unknown) {
    result.errors.push(`Failed to append log: ${(err as Error).message}`);
  }

  return result;
}
