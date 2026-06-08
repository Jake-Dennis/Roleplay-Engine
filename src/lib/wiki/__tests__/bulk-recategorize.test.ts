import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import {
  bulkRecategorize,
  type RecategorizeFilter,
  type RecategorizeChanges,
} from "../bulk-recategorize";
import { readWikiPage, writeWikiPage, listWikiPages } from "../file-io";
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
 *   entities/characters/gandalf.md    (type: entity, subtype: character, tags: [wizard, istari])
 *   entities/characters/frodo.md      (type: entity, subtype: character, tags: [hobbit])
 *   entities/items/sting.md           (type: entity, subtype: item,   tags: [weapon, important])
 *   concepts/events/battle.md         (type: concept, subtype: event, tags: [war, important])
 */
function createTestWiki(root: string): void {
  writeWikiPage(
    path.join(root, "entities/characters/gandalf.md"),
    "# Gandalf\n\nGandalf is a wizard.",
    {
      title: "Gandalf",
      type: "entity",
      subtype: "character",
      status: "draft",
      tags: ["wizard", "istari"],
    },
  );

  writeWikiPage(
    path.join(root, "entities/characters/frodo.md"),
    "# Frodo\n\nFrodo is a hobbit.",
    {
      title: "Frodo",
      type: "entity",
      subtype: "character",
      status: "draft",
      tags: ["hobbit"],
    },
  );

  writeWikiPage(
    path.join(root, "entities/items/sting.md"),
    "# Sting\n\nSting is a sword.",
    {
      title: "Sting",
      type: "entity",
      subtype: "item",
      status: "reviewed",
      tags: ["weapon", "important"],
    },
  );

  writeWikiPage(
    path.join(root, "concepts/events/battle.md"),
    "# Battle of Hornburg\n\nA great battle.",
    {
      title: "Battle of Hornburg",
      type: "concept",
      subtype: "event",
      status: "draft",
      tags: ["war", "important"],
    },
  );
}

/** Resolve the relative path of a file within the wiki root. */
function relPath(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkRecategorize", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-bulk-recat-"));
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
  // Filtering
  // -----------------------------------------------------------------------

  it("filters by type — finds all entity pages", () => {
    const filter: RecategorizeFilter = { type: "entity" };
    const result = bulkRecategorize(filter, { newStatus: "reviewed" }, tmpDir, {
      dryRun: true,
    });

    expect(result.totalAffected).toBe(3);
    expect(result.errors).toHaveLength(0);

    const paths = result.changes.map((c) => relPath(tmpDir, c.path));
    expect(paths).toContain("entities/characters/gandalf.md");
    expect(paths).toContain("entities/characters/frodo.md");
    expect(paths).toContain("entities/items/sting.md");
  });

  it("filters by subtype — finds all character pages", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const result = bulkRecategorize(filter, { newStatus: "reviewed" }, tmpDir, {
      dryRun: true,
    });

    expect(result.totalAffected).toBe(2);
    expect(result.errors).toHaveLength(0);

    const paths = result.changes.map((c) => relPath(tmpDir, c.path));
    expect(paths).toContain("entities/characters/gandalf.md");
    expect(paths).toContain("entities/characters/frodo.md");
    expect(paths).not.toContain("entities/items/sting.md");
  });

  it("filters by tag — finds all pages tagged 'important'", () => {
    const filter: RecategorizeFilter = { tag: "important" };
    const result = bulkRecategorize(filter, { newStatus: "reviewed" }, tmpDir, {
      dryRun: true,
    });

    expect(result.totalAffected).toBe(2);
    expect(result.errors).toHaveLength(0);

    const paths = result.changes.map((c) => relPath(tmpDir, c.path));
    expect(paths).toContain("entities/items/sting.md");
    expect(paths).toContain("concepts/events/battle.md");
  });

  it("filters by status — finds all reviewed pages", () => {
    const filter: RecategorizeFilter = { status: "reviewed" };
    const result = bulkRecategorize(filter, { newTags: ["archived"] }, tmpDir, {
      dryRun: true,
    });

    expect(result.totalAffected).toBe(1);
    expect(result.changes[0].proposed.tags).toContain("archived");
  });

  it("filters by folder — finds all pages in entities/characters", () => {
    const filter: RecategorizeFilter = { folder: "entities/characters" };
    const result = bulkRecategorize(filter, { newStatus: "reviewed" }, tmpDir, {
      dryRun: true,
    });

    expect(result.totalAffected).toBe(2);
    const paths = result.changes.map((c) => relPath(tmpDir, c.path));
    expect(paths).toContain("entities/characters/gandalf.md");
    expect(paths).toContain("entities/characters/frodo.md");
  });

  it("ANDs multiple filter criteria", () => {
    // type=entity AND subtype=character
    const filter: RecategorizeFilter = { type: "entity", subtype: "character" };
    const result = bulkRecategorize(filter, { newStatus: "reviewed" }, tmpDir, {
      dryRun: true,
    });

    expect(result.totalAffected).toBe(2);
    // Should NOT include sting.md (subtype=item, not character)
    const paths = result.changes.map((c) => relPath(tmpDir, c.path));
    expect(paths).not.toContain("entities/items/sting.md");
  });

  it("empty filter matches all pages", () => {
    const result = bulkRecategorize({}, { newStatus: "reviewed" }, tmpDir, {
      dryRun: true,
    });

    expect(result.totalAffected).toBe(4);
  });

  // -----------------------------------------------------------------------
  // Changes — Tags
  // -----------------------------------------------------------------------

  it("adds tags to all matching pages", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = { addTags: ["shire"] };

    // Dry-run first
    const dryResult = bulkRecategorize(filter, changes, tmpDir, { dryRun: true });

    expect(dryResult.totalAffected).toBe(2);
    for (const item of dryResult.changes) {
      expect(item.proposed.tags).toContain("shire");
    }

    // Apply
    const applyResult = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(applyResult.errors).toHaveLength(0);

    // Verify files changed
    const gandalf = readWikiPage(path.join(tmpDir, "entities/characters/gandalf.md"));
    expect(gandalf.frontmatter.tags).toContain("shire");
    expect(gandalf.frontmatter.tags).toContain("wizard"); // original preserved

    const frodo = readWikiPage(path.join(tmpDir, "entities/characters/frodo.md"));
    expect(frodo.frontmatter.tags).toContain("shire");
    expect(frodo.frontmatter.tags).toContain("hobbit"); // original preserved
  });

  it("removes tags from all matching pages", () => {
    const filter: RecategorizeFilter = { type: "entity" };
    const changes: RecategorizeChanges = { removeTags: ["important"] };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);

    // sting.md had [weapon, important] → should now be [weapon]
    const sting = readWikiPage(path.join(tmpDir, "entities/items/sting.md"));
    expect(sting.frontmatter.tags).not.toContain("important");
    expect(sting.frontmatter.tags).toContain("weapon");

    // gandalf.md didn't have "important" — unchanged
    const gandalf = readWikiPage(path.join(tmpDir, "entities/characters/gandalf.md"));
    expect(gandalf.frontmatter.tags).toContain("wizard");
  });

  it("replaces tags with newTags", () => {
    const filter: RecategorizeFilter = { tag: "important" };
    const changes: RecategorizeChanges = { newTags: ["critical", "notable"] };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);

    const sting = readWikiPage(path.join(tmpDir, "entities/items/sting.md"));
    expect(sting.frontmatter.tags).toEqual(["critical", "notable"]);

    const battle = readWikiPage(path.join(tmpDir, "concepts/events/battle.md"));
    expect(battle.frontmatter.tags).toEqual(["critical", "notable"]);
  });

  it("combines addTags and removeTags in a single change", () => {
    const filter: RecategorizeFilter = { tag: "important" };
    const changes: RecategorizeChanges = {
      addTags: ["highlighted"],
      removeTags: ["important"],
    };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);

    // sting.md had [weapon, important] → [weapon, highlighted]
    const sting = readWikiPage(path.join(tmpDir, "entities/items/sting.md"));
    expect(sting.frontmatter.tags).toContain("weapon");
    expect(sting.frontmatter.tags).toContain("highlighted");
    expect(sting.frontmatter.tags).not.toContain("important");
  });

  // -----------------------------------------------------------------------
  // Changes — Status
  // -----------------------------------------------------------------------

  it("changes status on all matching pages", () => {
    const filter: RecategorizeFilter = { status: "draft" };
    const changes: RecategorizeChanges = { newStatus: "reviewed" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);
    expect(result.totalAffected).toBe(3);

    const gandalf = readWikiPage(path.join(tmpDir, "entities/characters/gandalf.md"));
    expect(gandalf.frontmatter.status).toBe("reviewed");

    const battle = readWikiPage(path.join(tmpDir, "concepts/events/battle.md"));
    expect(battle.frontmatter.status).toBe("reviewed");

    // sting was already "reviewed" — not in the filter
    const sting = readWikiPage(path.join(tmpDir, "entities/items/sting.md"));
    expect(sting.frontmatter.status).toBe("reviewed");
  });

  // -----------------------------------------------------------------------
  // Changes — Subtype (with folder move)
  // -----------------------------------------------------------------------

  it("changes subtype and moves files to the correct folder", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = { newSubtype: "item" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);
    expect(result.totalAffected).toBe(2);

    // Files should be moved to entities/items/
    expect(fs.existsSync(path.join(tmpDir, "entities/items/gandalf.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/items/frodo.md"))).toBe(true);

    // Files should no longer be at old locations
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/frodo.md"))).toBe(false);

    // Frontmatter should be updated
    const gandalf = readWikiPage(path.join(tmpDir, "entities/items/gandalf.md"));
    expect(gandalf.frontmatter.subtype).toBe("item");

    // Tags should be preserved
    expect(gandalf.frontmatter.tags).toContain("wizard");
  });

  it("changes subtype and also updates tags in the same operation", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = {
      newSubtype: "item",
      addTags: ["moved"],
    };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);

    const gandalf = readWikiPage(path.join(tmpDir, "entities/items/gandalf.md"));
    expect(gandalf.frontmatter.subtype).toBe("item");
    expect(gandalf.frontmatter.tags).toContain("moved");
    expect(gandalf.frontmatter.tags).toContain("wizard"); // preserved
  });

  it("changes type to move pages between top-level folders", () => {
    // Create a page with no subtype so that type determines the folder
    writeWikiPage(
      path.join(tmpDir, "entities/untyped-thing.md"),
      "# Untyped Thing\n\nA page with no subtype.",
      {
        title: "Untyped Thing",
        type: "entity",
        status: "draft",
        tags: ["test"],
      },
    );

    const filter: RecategorizeFilter = { tag: "test" };
    const changes: RecategorizeChanges = { newType: "concept" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);
    expect(result.totalAffected).toBe(1);

    // Page should move from entities/ to concepts/
    expect(fs.existsSync(path.join(tmpDir, "concepts/untyped-thing.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/untyped-thing.md"))).toBe(false);

    const page = readWikiPage(path.join(tmpDir, "concepts/untyped-thing.md"));
    expect(page.frontmatter.type).toBe("concept");
  });

  // -----------------------------------------------------------------------
  // Dry-run
  // -----------------------------------------------------------------------

  it("dry-run does not modify any files (default behavior)", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = { newSubtype: "item" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: true });
    expect(result.totalAffected).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Proposed changes should indicate the new folder
    for (const item of result.changes) {
      expect(item.proposed.subtype).toBe("item");
      expect(item.proposed.newFolder).toBe("entities/items");
    }

    // Files should NOT have moved
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/frodo.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/items/gandalf.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "entities/items/frodo.md"))).toBe(false);

    // Frontmatter should NOT have changed
    const gandalf = readWikiPage(path.join(tmpDir, "entities/characters/gandalf.md"));
    expect(gandalf.frontmatter.subtype).toBe("character");
  });

  // -----------------------------------------------------------------------
  // Apply — verification that files DO change
  // -----------------------------------------------------------------------

  it("apply mode updates frontmatter on all matching pages", () => {
    const filter: RecategorizeFilter = { type: "entity" };
    const changes: RecategorizeChanges = { newStatus: "locked" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);

    // All entity pages should now be "locked"
    const allPages = listWikiPages(tmpDir, { includeDormant: true });
    const entityPages = allPages.filter((p) => p.frontmatter.type === "entity");
    for (const page of entityPages) {
      expect(page.frontmatter.status).toBe("locked");
    }

    // Non-entity pages should be unchanged
    const battle = readWikiPage(path.join(tmpDir, "concepts/events/battle.md"));
    expect(battle.frontmatter.status).toBe("draft");
  });

  it("apply mode moves files when subtype changes", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = { newSubtype: "item" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);

    // Old locations gone
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/frodo.md"))).toBe(false);

    // New locations exist
    expect(fs.existsSync(path.join(tmpDir, "entities/items/gandalf.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/items/frodo.md"))).toBe(true);

    // Frontmatter updated at new location
    const gandalf = readWikiPage(path.join(tmpDir, "entities/items/gandalf.md"));
    expect(gandalf.frontmatter.subtype).toBe("item");
    expect(gandalf.frontmatter.type).toBe("entity");
  });

  it("apply mode does not move files when only tags/status change (same folder)", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = { addTags: ["hero"] };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors).toHaveLength(0);

    // Files should still be in the same location
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/gandalf.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "entities/characters/frodo.md"))).toBe(true);

    // Tags should be updated
    const gandalf = readWikiPage(path.join(tmpDir, "entities/characters/gandalf.md"));
    expect(gandalf.frontmatter.tags).toContain("hero");
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("handles errors gracefully and continues processing", () => {
    // Create a malformed page that will fail when writeWikiPage tries to write it
    // Missing required "title" field will cause writeWikiPage to throw
    const badDir = path.join(tmpDir, "entities/bad");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "bad-page.md"),
      "---\n" +
        "type: entity\n" +
        "status: draft\n" +
        "---\n" +
        "# Bad Page\n\nNo title in frontmatter.",
      "utf-8",
    );

    const filter: RecategorizeFilter = { type: "entity" };
    const changes: RecategorizeChanges = { newStatus: "reviewed" };

    // This should not throw; errors should be collected
    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: false });
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.totalAffected).toBe(4); // 3 valid entity pages + 1 bad page
  });

  // -----------------------------------------------------------------------
  // Proposed changes structure
  // -----------------------------------------------------------------------

  it("proposed changes include only the fields that would change", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = { newStatus: "reviewed" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: true });
    expect(result.totalAffected).toBe(2);

    for (const item of result.changes) {
      expect(item.proposed.status).toBe("reviewed");
      // Since we didn't change subtype/type, newFolder should not be set
      expect(item.proposed.newFolder).toBeUndefined();
      // Since we didn't touch tags, proposed.tags should not be set
      expect(item.proposed.tags).toBeUndefined();
      expect(item.proposed.subtype).toBeUndefined();
    }
  });

  it("proposed changes include newFolder when subtype changes causes a move", () => {
    const filter: RecategorizeFilter = { subtype: "character" };
    const changes: RecategorizeChanges = { newSubtype: "item" };

    const result = bulkRecategorize(filter, changes, tmpDir, { dryRun: true });

    for (const item of result.changes) {
      expect(item.proposed.subtype).toBe("item");
      expect(item.proposed.newFolder).toBe("entities/items");
    }
  });
});
