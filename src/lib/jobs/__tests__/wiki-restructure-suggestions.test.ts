/**
 * Tests for wiki-restructure-suggestions job handler and scanner.
 *
 * Uses real temp directories with fixture wiki pages to test the
 * suggestRestructure function against actual disk I/O.
 *
 * Pattern reference: src/lib/wiki/__tests__/subtype-folders.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

// Import the function under test
import { suggestRestructure, handleWikiSuggestRestructure } from "../wiki-restructure-suggestions";

// Import helpers for setting up the wiki config
import { writeWikiConfigV2 } from "@/lib/wiki/config-migration";
import { clearTypeRegistryCache } from "@/lib/wiki/type-registry";
import {
  DEFAULT_TYPE_DEFS,
  DEFAULT_SUBTYPE_FOLDERS,
  type WikiConfigV2,
} from "@/lib/wiki/config-types";

// ===========================================================================
// Test Fixture Helpers
// ===========================================================================

const TEST_JOB_ID = "job-restructure-001";

/**
 * Helper to write a wiki page to disk with YAML frontmatter + body.
 */
function writeWikiPage(
  wikiRoot: string,
  subPath: string,
  frontmatter: Record<string, unknown>,
  body = "Page content.\n",
): string {
  const fullPath = path.join(wikiRoot, subPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Build minimal YAML frontmatter
  const fmLines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === "string") {
      fmLines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      fmLines.push(`${key}:`);
      for (const item of value) {
        fmLines.push(`  - ${item}`);
      }
    }
  }
  fmLines.push("---");

  fs.writeFileSync(fullPath, fmLines.join("\n") + "\n" + body, "utf-8");
  return fullPath;
}

/**
 * Create a wiki root with fixture pages for testing.
 */
function createFixtureWiki(
  tmpDir: string,
  config: WikiConfigV2,
): string {
  const wikiRoot = path.join(tmpDir, "wiki");
  fs.mkdirSync(wikiRoot, { recursive: true });

  // Write the type registry config
  writeWikiConfigV2(wikiRoot, config);

  // Create required top-level folders
  const folders = Object.values(config.types).map((t) => t.folder);
  const allFolders = [
    ...new Set([...folders, ...Object.values(config.subtypeFolders)]),
  ];
  for (const folder of allFolders) {
    const dir = path.join(wikiRoot, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return wikiRoot;
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe("suggestRestructure", () => {
  let tmpDir: string;
  let wikiRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-restructure-test-"));
    clearTypeRegistryCache();
  });

  afterEach(() => {
    clearTypeRegistryCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Test 1: Empty wiki returns no suggestions
  // -----------------------------------------------------------------------
  it("returns empty array for empty wiki", () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    const results = suggestRestructure(wikiRoot);
    expect(results).toBeEmpty(); // or .toEqual([])
    expect(results.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Test 2: Clean wiki (well-placed pages) returns no suggestions
  // -----------------------------------------------------------------------
  it("returns empty array for a well-structured wiki", () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    // A character in the right place
    writeWikiPage(wikiRoot, "entities/characters/aldric.md", {
      title: "Aldric",
      type: "entity",
      subtype: "character",
      status: "reviewed",
    });

    // A location in the right place
    writeWikiPage(wikiRoot, "entities/locations/forest.md", {
      title: "Forest",
      type: "entity",
      subtype: "location",
      status: "reviewed",
    });

    // A concept with no subtype in the right folder
    writeWikiPage(wikiRoot, "concepts/lore.md", {
      title: "World Lore",
      type: "concept",
      status: "reviewed",
    });

    const results = suggestRestructure(wikiRoot);
    expect(results).toBeEmpty();
  });

  // -----------------------------------------------------------------------
  // Test 3: Detects subtype not in registry
  // -----------------------------------------------------------------------
  it("detects pages with subtypes not in the registry", () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    // Page with an unknown subtype
    writeWikiPage(wikiRoot, "entities/characters/mystery.md", {
      title: "Mystery Being",
      type: "entity",
      subtype: "eldritch",
      status: "draft",
    });

    const results = suggestRestructure(wikiRoot);
    expect(results.length).toBe(1);

    const suggestion = results[0];
    expect(suggestion.page).toBe("entities/characters/mystery.md");
    expect(suggestion.fixType).toBe("update-frontmatter");
    expect(suggestion.issue).toContain("eldritch");
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // -----------------------------------------------------------------------
  // Test 4: Detects page in wrong folder for its subtype
  // -----------------------------------------------------------------------
  it("detects pages placed in the wrong folder for their subtype", () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    // A character placed in concepts/themes instead of entities/characters
    writeWikiPage(wikiRoot, "concepts/themes/aldric.md", {
      title: "Aldric",
      type: "entity",
      subtype: "character",
      status: "reviewed",
    });

    const results = suggestRestructure(wikiRoot);
    expect(results.length).toBe(1);

    const suggestion = results[0];
    expect(suggestion.page).toBe("concepts/themes/aldric.md");
    expect(suggestion.fixType).toBe("move");
    expect(suggestion.suggestion).toContain("entities/characters");
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.8);
  });

  // -----------------------------------------------------------------------
  // Test 5: Detects multiple issues
  // -----------------------------------------------------------------------
  it("detects multiple structural issues across pages", () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    // Issue 1: Unknown subtype
    writeWikiPage(wikiRoot, "entities/items/strange-artifact.md", {
      title: "Strange Artifact",
      type: "entity",
      subtype: "artifact",
      status: "draft",
    });

    // Issue 2: Wrong folder
    writeWikiPage(wikiRoot, "concepts/themes/tavern.md", {
      title: "The Drunken Duck",
      type: "entity",
      subtype: "location",
      status: "reviewed",
    });

    // Clean page — should not appear
    writeWikiPage(wikiRoot, "entities/characters/lyra.md", {
      title: "Lyra",
      type: "entity",
      subtype: "character",
      status: "reviewed",
    });

    const results = suggestRestructure(wikiRoot);
    expect(results.length).toBe(2);

    const issues = results.map((r) => r.issue);
    const pages = results.map((r) => r.page);
    expect(issues.some((i) => i.includes("artifact"))).toBeTrue();
    expect(pages.some((p) => p.includes("tavern"))).toBeTrue();
    expect(issues.some((i) => i.includes("entities/locations"))).toBeTrue();
  });

  // -----------------------------------------------------------------------
  // Test 6: Detects type-based folder mismatch (no subtype)
  // -----------------------------------------------------------------------
  it("detects pages in the wrong folder based on type alone (no subtype)", () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    // A concept page sitting in entities folder
    writeWikiPage(wikiRoot, "entities/my-concept.md", {
      title: "My Concept",
      type: "concept",
      status: "draft",
    });

    const results = suggestRestructure(wikiRoot);
    expect(results.length).toBe(1);

    const suggestion = results[0];
    expect(suggestion.page).toBe("entities/my-concept.md");
    expect(suggestion.fixType).toBe("move");
    expect(suggestion.suggestion).toContain("concepts/");
    expect(suggestion.confidence).toBe(0.7);
  });
});

// ===========================================================================
// Handler Tests
// ===========================================================================

describe("handleWikiSuggestRestructure", () => {
  let tmpDir: string;
  let wikiRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-restructure-hdlr-"));
    clearTypeRegistryCache();
  });

  afterEach(() => {
    clearTypeRegistryCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Test 7: Missing wikiRoot throws
  // -----------------------------------------------------------------------
  it("throws when payload is missing wikiRoot", async () => {
    await expect(
      handleWikiSuggestRestructure(TEST_JOB_ID, {}),
    ).rejects.toThrow("Missing required payload field: wikiRoot");
  });

  // -----------------------------------------------------------------------
  // Test 8: Returns results for a valid wiki with issues
  // -----------------------------------------------------------------------
  it("returns suggestions for a wiki with issues", async () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    writeWikiPage(wikiRoot, "concepts/themes/wolf.md", {
      title: "Shadow Wolf",
      type: "entity",
      subtype: "creature",
      status: "reviewed",
    });

    const result = await handleWikiSuggestRestructure(TEST_JOB_ID, {
      wikiRoot,
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe(TEST_JOB_ID);
    expect(result.type).toBe("wiki_suggest_restructure");
    expect(result.data).toBeDefined();
    expect((result.data as any).count).toBe(1);
    expect((result.data as any).suggestions).toBeArrayOfSize(1);
    expect((result.data as any).suggestions[0].fixType).toBe("move");
  });

  // -----------------------------------------------------------------------
  // Test 9: Returns zero count for a clean wiki
  // -----------------------------------------------------------------------
  it("returns zero count for a clean wiki", async () => {
    wikiRoot = createFixtureWiki(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    writeWikiPage(wikiRoot, "entities/characters/lyra.md", {
      title: "Lyra",
      type: "entity",
      subtype: "character",
      status: "reviewed",
    });

    const result = await handleWikiSuggestRestructure(TEST_JOB_ID, {
      wikiRoot,
    });

    expect(result.success).toBe(true);
    expect((result.data as any).count).toBe(0);
    expect((result.data as any).suggestions).toBeArrayOfSize(0);
  });
});
