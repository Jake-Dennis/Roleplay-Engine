import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { bulkMovePages, type BulkMoveItem } from "../bulk-move";
import { readWikiPage, writeWikiPage } from "../file-io";
import { clearTypeRegistryCache } from "../type-registry";
import { writeWikiConfigV2 } from "../config-migration";
import { DEFAULT_TYPE_DEFS, DEFAULT_SUBTYPE_FOLDERS } from "../config-types";

// ---------------------------------------------------------------------------
// Fixture Helpers
// ---------------------------------------------------------------------------

/**
 * Create a standard test wiki with 4 pages across multiple folders.
 *
 * Structure:
 *   entities/characters/gandalf.md
 *   entities/characters/frodo.md
 *   entities/items/sting.md
 *   concepts/events/battle-of-hornburg.md
 */
function createTestWiki(root: string): void {
  writeWikiPage(
    path.join(root, "entities/characters/gandalf.md"),
    "# Gandalf\n\nGandalf is a wizard.\n\nSee [[entities/characters/frodo]] for his friend.",
    { title: "Gandalf", type: "entity", subtype: "character", status: "draft" },
  );

  writeWikiPage(
    path.join(root, "entities/characters/frodo.md"),
    "# Frodo\n\nFrodo is a hobbit.\n\nSee [[entities/characters/gandalf]] for the wizard.",
    { title: "Frodo", type: "entity", subtype: "character", status: "draft" },
  );

  writeWikiPage(
    path.join(root, "entities/items/sting.md"),
    "# Sting\n\nSting is a sword.\n\nUsed by [[entities/characters/frodo]].",
    { title: "Sting", type: "entity", subtype: "item", status: "draft" },
  );

  writeWikiPage(
    path.join(root, "concepts/events/battle-of-hornburg.md"),
    "# Battle of Hornburg\n\nA great battle.\n\nFought by [[entities/characters/gandalf]].",
    { title: "Battle of Hornburg", type: "concept", subtype: "event", status: "draft" },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkMovePages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-bulk-move-"));
    clearTypeRegistryCache();

    // Write a v2 config so the type registry knows about subtype folders
    writeWikiConfigV2(tmpDir, {
      version: 2,
      folderOrder: ["entities", "concepts"],
      types: DEFAULT_TYPE_DEFS,
      subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
    });

    createTestWiki(tmpDir);
  });

  afterEach(() => {
    clearTypeRegistryCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Basic move operations
  // -----------------------------------------------------------------------

  it("moves a single page between folders", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.moved).toEqual(["entities/characters/gandalf.md"]);
    expect(result.failed).toHaveLength(0);

    // File exists at new path
    expect(fs.existsSync(path.join(tmpDir, "characters/gandalf.md"))).toBe(true);

    // File no longer exists at old path
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(false);
  });

  it("moves multiple pages in a single batch", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
      { oldPath: "entities/characters/frodo.md", newPath: "characters/frodo.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.moved).toHaveLength(2);
    expect(result.failed).toHaveLength(0);

    // Files exist at new paths
    expect(fs.existsSync(path.join(tmpDir, "characters/gandalf.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "characters/frodo.md"))).toBe(true);

    // Files no longer exist at old paths
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/frodo.md"))).toBe(false);
  });

  it("moves pages between subtype folders within the same type", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "entities/items/gandalf.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.moved).toHaveLength(1);
    expect(fs.existsSync(path.join(tmpDir, "entities/items/gandalf.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(false);

    // Frontmatter should have updated subtype
    const page = readWikiPage(path.join(tmpDir, "entities/items/gandalf.md"));
    expect(page.frontmatter.subtype).toBe("item");
  });

  it("moves a page from a 2-level subfolder to a flat folder, updating frontmatter", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "heroes/gandalf.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.moved).toHaveLength(1);
    expect(fs.existsSync(path.join(tmpDir, "heroes/gandalf.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(false);

    // Type should be singularized from folder name
    // singularizeFolder("heroes") strips trailing "s" → "heroe" (not in the map)
    const page = readWikiPage(path.join(tmpDir, "heroes/gandalf.md"));
    expect(page.frontmatter.type).toBe("heroe");
    // subtype should be cleared since we're not in a 2-level folder
    expect(page.frontmatter.subtype).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Dry-run
  // -----------------------------------------------------------------------

  it("dry-run does not move any files (default behavior)", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
    ];

    const result = bulkMovePages(moves, tmpDir, { dryRun: true });

    // Dry-run should report the move as "moved"
    expect(result.moved).toEqual(["entities/characters/gandalf.md"]);
    expect(result.failed).toHaveLength(0);

    // But the file should still be at the old location
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(true);

    // And should NOT exist at the new location
    expect(fs.existsSync(path.join(tmpDir, "characters/gandalf.md"))).toBe(false);
  });

  it("dry-run still scans and reports link changes", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
      { oldPath: "entities/characters/frodo.md", newPath: "characters/frodo.md" },
    ];

    // First, a non-dry run to actually move files
    const result = bulkMovePages(moves, tmpDir, { dryRun: false });

    expect(result.moved).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    // Links should be rewritten: sting.md and battle-of-hornburg.md reference
    // the moved characters, and the moved pages reference each other
    expect(result.linksUpdated).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  it("reports a failed move when the source file does not exist", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/nonexistent.md", newPath: "characters/nonexistent.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.moved).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].path).toBe("entities/characters/nonexistent.md");
    expect(result.failed[0].reason).toContain("not found");
  });

  it("reports a failed move when the destination already exists", () => {
    // Create a file at the destination path first
    fs.mkdirSync(path.join(tmpDir, "characters"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "characters/gandalf.md"),
      "---\ntitle: Existing\ntype: entity\nstatus: draft\n---\nExisting content",
      "utf-8",
    );

    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain("already exists");
  });

  it("rejects path traversal attempts", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "../outside.md", newPath: "safe.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain("traversal");
  });

  it("rejects destination path traversal", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "../outside.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain("traversal");
  });

  it("handles a mix of successful and failed moves", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
      { oldPath: "entities/characters/nonexistent.md", newPath: "characters/nonexistent.md" },
      { oldPath: "entities/characters/frodo.md", newPath: "characters/frodo.md" },
    ];

    const result = bulkMovePages(moves, tmpDir);

    expect(result.moved).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // Link rewriting
  // -----------------------------------------------------------------------

  it("rewrites wikilinks in other pages to point to the new path", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
    ];

    bulkMovePages(moves, tmpDir, { dryRun: false });

    // battle-of-hornburg.md had [[entities/characters/gandalf]] → should be [[characters/gandalf]]
    const battle = readWikiPage(path.join(tmpDir, "concepts/events/battle-of-hornburg.md"));
    expect(battle.content).toContain("[[characters/gandalf]]");
    expect(battle.content).not.toContain("[[entities/characters/gandalf]]");

    // sting.md links to frodo (not gandalf) so it should be unchanged
    const sting = readWikiPage(path.join(tmpDir, "entities/items/sting.md"));
    expect(sting.content).toContain("[[entities/characters/frodo]]");
  });

  it("rewrites wikilinks in the moved page's own content", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
      { oldPath: "entities/characters/frodo.md", newPath: "characters/frodo.md" },
    ];

    bulkMovePages(moves, tmpDir, { dryRun: false });

    // gandalf.md had [[entities/characters/frodo]] → should be [[characters/frodo]]
    const gandalf = readWikiPage(path.join(tmpDir, "characters/gandalf.md"));
    expect(gandalf.content).toContain("[[characters/frodo]]");
    expect(gandalf.content).not.toContain("[[entities/characters/frodo]]");
  });

  it("rewrites links for multiple moved pages in the same batch", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "heroes/gandalf.md" },
      { oldPath: "entities/characters/frodo.md", newPath: "heroes/frodo.md" },
    ];

    bulkMovePages(moves, tmpDir, { dryRun: false });

    // sting.md had [[entities/characters/frodo]] → should be [[heroes/frodo]]
    const sting = readWikiPage(path.join(tmpDir, "entities/items/sting.md"));
    expect(sting.content).toContain("[[heroes/frodo]]");
    expect(sting.content).not.toContain("[[entities/characters/frodo]]");

    // battle-of-hornburg.md had [[entities/characters/gandalf]] → should be [[heroes/gandalf]]
    const battle = readWikiPage(path.join(tmpDir, "concepts/events/battle-of-hornburg.md"));
    expect(battle.content).toContain("[[heroes/gandalf]]");
    expect(battle.content).not.toContain("[[entities/characters/gandalf]]");
  });

  it("leaves bare-name wikilinks unchanged", () => {
    // Create a page with bare-name links (not path-based)
    writeWikiPage(
      path.join(tmpDir, "concepts/events/riddle-game.md"),
      "# Riddle Game\n\nGollum and [[Bilbo]] played riddles.\nSee also [[entities/characters/gandalf]].",
      { title: "Riddle Game", type: "concept", subtype: "event", status: "draft" },
    );

    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
    ];

    bulkMovePages(moves, tmpDir, { dryRun: false });

    const riddle = readWikiPage(path.join(tmpDir, "concepts/events/riddle-game.md"));

    // Bare-name link [[Bilbo]] should be unchanged
    expect(riddle.content).toContain("[[Bilbo]]");

    // Path-based link [[entities/characters/gandalf]] should be rewritten
    expect(riddle.content).toContain("[[characters/gandalf]]");
    expect(riddle.content).not.toContain("[[entities/characters/gandalf]]");
  });

  // -----------------------------------------------------------------------
  // Frontmatter updates
  // -----------------------------------------------------------------------

  it("updates frontmatter type when moving to a folder with a different type", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "concepts/events/gandalf.md" },
    ];

    bulkMovePages(moves, tmpDir, { dryRun: false });

    const page = readWikiPage(path.join(tmpDir, "concepts/events/gandalf.md"));
    // "concepts" → singularizeFolder → "concept"
    expect(page.frontmatter.type).toBe("concept");
    expect(page.frontmatter.subtype).toBe("event");
  });

  it("preserves frontmatter type when moving within the same folder", () => {
    const moves: BulkMoveItem[] = [
      { oldPath: "entities/characters/gandalf.md", newPath: "entities/characters/grey-gandalf.md" },
    ];

    bulkMovePages(moves, tmpDir, { dryRun: false });

    const page = readWikiPage(path.join(tmpDir, "entities/characters/grey-gandalf.md"));
    expect(page.frontmatter.type).toBe("entity");
    expect(page.frontmatter.subtype).toBe("character");
  });

  it("uses explicit newSubtype when provided", () => {
    const moves: BulkMoveItem[] = [
      {
        oldPath: "entities/characters/gandalf.md",
        newPath: "entities/creatures/gandalf.md",
        newSubtype: "creature",
      },
    ];

    bulkMovePages(moves, tmpDir, { dryRun: false });

    const page = readWikiPage(path.join(tmpDir, "entities/creatures/gandalf.md"));
    expect(page.frontmatter.subtype).toBe("creature");
  });
});
