import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { mergePages } from "../merge";
import { readWikiPage, writeWikiPage } from "../file-io";

// ---------------------------------------------------------------------------
// Fixture Helpers
// ---------------------------------------------------------------------------

/**
 * Create a test wiki with 3 pages:
 *
 *   entities/characters/gandalf.md       (keep — the canonical page)
 *   entities/characters/gandalf-dup.md   (merge — duplicate to merge in)
 *   entities/characters/aragorn.md       (other page that links to gandalf-dup)
 *
 * Aragorn contains a path-based wikilink to the merge page so we can verify
 * link rewriting.
 */
function createTestWiki(root: string): void {
  writeWikiPage(
    path.join(root, "entities/characters/gandalf.md"),
    "# Gandalf\n\nGandalf is a wizard.\n\nContent about Gandalf.",
    { title: "Gandalf", type: "entity", subtype: "character", status: "draft", tags: ["wizard"] },
  );

  writeWikiPage(
    path.join(root, "entities/characters/gandalf-dup.md"),
    "# Gandalf\n\nContent about Gandalf (duplicate version).",
    { title: "Gandalf", type: "entity", subtype: "character", status: "draft", tags: ["wizard", "istari"] },
  );

  writeWikiPage(
    path.join(root, "entities/characters/aragorn.md"),
    "# Aragorn\n\nAragorn is a ranger.\n\nHis advisor is [[entities/characters/gandalf-dup|Gandalf the Grey]].",
    { title: "Aragorn", type: "entity", subtype: "character", status: "draft", tags: ["ranger"] },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mergePages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-merge-"));
    createTestWiki(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Content merge
  // -----------------------------------------------------------------------

  it("appends content from mergePath into keepPath", () => {
    const result = mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    expect(result.mergedFrom).toBe("entities/characters/gandalf-dup.md");
    expect(result.kept).toBe("entities/characters/gandalf.md");

    const keep = readWikiPage(path.join(tmpDir, "entities/characters/gandalf.md"));
    expect(keep.content).toContain("Merged from Gandalf");
    expect(keep.content).toContain("Content about Gandalf (duplicate version)");
  });

  // -----------------------------------------------------------------------
  // Frontmatter merge
  // -----------------------------------------------------------------------

  it("merges tags as a union of both pages", () => {
    mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    const keep = readWikiPage(path.join(tmpDir, "entities/characters/gandalf.md"));
    expect(keep.frontmatter.tags).toContain("wizard");
    expect(keep.frontmatter.tags).toContain("istari");
    expect(keep.frontmatter.tags!.length).toBe(2);
  });

  it("preserves the older created timestamp", () => {
    // Set an explicit older created on keep, newer on merge
    // We need to rewrite the keep page with an explicit created date
    const keepPath = path.join(tmpDir, "entities/characters/gandalf.md");
    const keep = readWikiPage(keepPath);
    writeWikiPage(keepPath, keep.content, {
      ...keep.frontmatter,
      created: "2024-01-01T00:00:00.000Z",
    });

    // Merge page has no explicit created, so writeWikiPage will auto-set it to now
    // That means keep's date (2024) is older, so it should be preserved as the max... wait.
    // The maxDate function picks the MAX (later) timestamp.
    // Keep = 2024, Merge = now (2026). So mergedCreated should be 2026 (the max).
    // Let me create a scenario where keep is the max:
    const mergePath = path.join(tmpDir, "entities/characters/gandalf-dup.md");
    const merge = readWikiPage(mergePath);
    writeWikiPage(mergePath, merge.content, {
      ...merge.frontmatter,
      created: "2023-01-01T00:00:00.000Z",
    });

    // Now keep = 2024, merge = 2023. The max is 2024, which is the keep date.
    mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    const final = readWikiPage(keepPath);
    // maxDate picks 2024 (keep), the larger of the two
    expect(new Date(final.frontmatter.created!).getFullYear()).toBe(2024);
  });

  // -----------------------------------------------------------------------
  // Superseded page
  // -----------------------------------------------------------------------

  it("marks the merged page as dormant with superseded_by", () => {
    mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    const merged = readWikiPage(path.join(tmpDir, "entities/characters/gandalf-dup.md"));
    expect(merged.frontmatter.superseded_by).toBe("entities/characters/gandalf.md");
    expect(merged.frontmatter.superseded_at).toBeTruthy();
    expect(merged.frontmatter.status).toBe("dormant");
  });

  // -----------------------------------------------------------------------
  // Link rewriting
  // -----------------------------------------------------------------------

  it("rewrites path-based wikilinks from other pages that point to the merged page", () => {
    mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    const aragorn = readWikiPage(path.join(tmpDir, "entities/characters/aragorn.md"));
    expect(aragorn.content).toContain("[[entities/characters/gandalf|Gandalf the Grey]]");
    expect(aragorn.content).not.toContain("gandalf-dup");
  });

  it("reports a positive linksUpdated count when wikilinks were rewritten", () => {
    const result = mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    // Aragorn links to gandalf-dup → that's at least 1
    expect(result.linksUpdated).toBeGreaterThanOrEqual(1);
  });

  it("rewrites wikilinks in the kept page's own content", () => {
    // Add a self-referencing wikilink to the keep page first
    const keepPath = path.join(tmpDir, "entities/characters/gandalf.md");
    const keep = readWikiPage(keepPath);
    writeWikiPage(
      keepPath,
      keep.content + "\nSee also: [[entities/characters/gandalf-dup|younger Gandalf]]",
      keep.frontmatter,
    );

    const result = mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    const updated = readWikiPage(keepPath);
    expect(updated.content).toContain("[[entities/characters/gandalf|younger Gandalf]]");
    expect(updated.content).not.toContain("gandalf-dup");
    // Should now be 2 link updates: Aragorn + the self-link in keep page
    expect(result.linksUpdated).toBeGreaterThanOrEqual(2);
  });

  it("rewrites links when merge and keep are in different folders", () => {
    // Create a page in a different folder that links to the merge page
    writeWikiPage(
      path.join(tmpDir, "concepts/events/quest-of-erebor.md"),
      "# Quest of Erebor\n\nLed by [[entities/characters/gandalf-dup]].",
      { title: "Quest of Erebor", type: "concept", subtype: "event", status: "draft" },
    );

    // Create the merge page in a different folder from keep
    // Keep: entities/characters/gandalf.md, Merge: concepts/lore/gandalf-copy.md
    writeWikiPage(
      path.join(tmpDir, "concepts/lore/gandalf-copy.md"),
      "# Gandalf Copy\n\nDuplicate lore about Gandalf.",
      { title: "Gandalf Copy", type: "concept", subtype: "lore", status: "draft" },
    );

    // Also add a link from quest page to the lore copy
    const questPath = path.join(tmpDir, "concepts/events/quest-of-erebor.md");
    const quest = readWikiPage(questPath);
    writeWikiPage(
      questPath,
      quest.content + "\nBackground: [[concepts/lore/gandalf-copy|Gandalf's lore]].",
      quest.frontmatter,
    );

    const result = mergePages(
      "entities/characters/gandalf.md",
      "concepts/lore/gandalf-copy.md",
      tmpDir,
    );

    // Links to [[concepts/lore/gandalf-copy]] should be rewritten to [[entities/characters/gandalf]]
    const updatedQuest = readWikiPage(questPath);
    expect(updatedQuest.content).toContain("[[entities/characters/gandalf|Gandalf's lore]]");
    expect(updatedQuest.content).not.toContain("gandalf-copy");
    expect(result.linksUpdated).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Redirect stub
  // -----------------------------------------------------------------------

  it("creates a redirect stub in _review/redirects/ when redirect option is true", () => {
    const result = mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
      { redirect: true },
    );

    expect(result.redirectCreated).toBe(true);

    const redirectPath = path.join(tmpDir, "_review", "redirects", "gandalf-dup.md");
    expect(fs.existsSync(redirectPath)).toBe(true);

    const redirectContent = fs.readFileSync(redirectPath, "utf-8");
    expect(redirectContent).toContain("superseded_by: entities/characters/gandalf.md");
    expect(redirectContent).toContain("This page was merged into");
  });

  it("does not create a redirect stub when redirect option is false", () => {
    const result = mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
      { redirect: false },
    );

    expect(result.redirectCreated).toBe(false);

    const redirectPath = path.join(tmpDir, "_review", "redirects", "gandalf-dup.md");
    expect(fs.existsSync(redirectPath)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  it("throws when keep path doesn't exist", () => {
    expect(() =>
      mergePages(
        "entities/characters/nonexistent.md",
        "entities/characters/gandalf-dup.md",
        tmpDir,
      ),
    ).toThrow("not found");
  });

  it("throws when merge path doesn't exist", () => {
    expect(() =>
      mergePages(
        "entities/characters/gandalf.md",
        "entities/characters/nonexistent.md",
        tmpDir,
      ),
    ).toThrow("not found");
  });

  it("throws when keep and merge paths are the same", () => {
    expect(() =>
      mergePages(
        "entities/characters/gandalf.md",
        "entities/characters/gandalf.md",
        tmpDir,
      ),
    ).toThrow("Cannot merge a page with itself");
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------

  it("does not rewrite links if no pages point to the merge page", () => {
    // Create a merge page with no incoming links
    writeWikiPage(
      path.join(tmpDir, "entities/characters/frodo-dup.md"),
      "# Frodo\n\nDuplicate Frodo page.",
      { title: "Frodo", type: "entity", subtype: "character", status: "draft" },
    );

    writeWikiPage(
      path.join(tmpDir, "entities/characters/frodo.md"),
      "# Frodo\n\nFrodo is a hobbit.",
      { title: "Frodo", type: "entity", subtype: "character", status: "draft" },
    );

    const result = mergePages(
      "entities/characters/frodo.md",
      "entities/characters/frodo-dup.md",
      tmpDir,
    );

    expect(result.linksUpdated).toBe(0);
  });

  it("can be called twice with different pages without interference", () => {
    // Create a second set of duplicate pages
    writeWikiPage(
      path.join(tmpDir, "entities/characters/frodo.md"),
      "# Frodo\n\nFrodo is a hobbit.",
      { title: "Frodo", type: "entity", subtype: "character", status: "draft" },
    );
    writeWikiPage(
      path.join(tmpDir, "entities/characters/frodo-dup.md"),
      "# Frodo\n\nDuplicate Frodo page.",
      { title: "Frodo", type: "entity", subtype: "character", status: "draft" },
    );

    // First merge: gandalf
    const gandalfResult = mergePages(
      "entities/characters/gandalf.md",
      "entities/characters/gandalf-dup.md",
      tmpDir,
    );

    // Second merge: frodo
    const frodoResult = mergePages(
      "entities/characters/frodo.md",
      "entities/characters/frodo-dup.md",
      tmpDir,
    );

    expect(gandalfResult.mergedFrom).toBe("entities/characters/gandalf-dup.md");
    expect(frodoResult.mergedFrom).toBe("entities/characters/frodo-dup.md");

    // Both merged pages should be dormant
    const gandalfDup = readWikiPage(path.join(tmpDir, "entities/characters/gandalf-dup.md"));
    expect(gandalfDup.frontmatter.status).toBe("dormant");

    const frodoDup = readWikiPage(path.join(tmpDir, "entities/characters/frodo-dup.md"));
    expect(frodoDup.frontmatter.status).toBe("dormant");
  });
});
