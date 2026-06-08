import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { findMergeCandidates } from "../merge-suggester";
import fs from "fs";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Fixture Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

/**
 * Write a wiki page with YAML frontmatter at a relative path inside the
 * temporary wiki root. Creates parent directories as needed.
 */
function writePage(relPath: string, content: string): void {
  const fullPath = path.join(tmpDir, relPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf-8");
}

/**
 * Create a standard wiki page with frontmatter and a heading + body.
 *
 * The frontmatter sets type=entity (overridable via the subtype choice) and
 * status=draft. The title is used as both frontmatter title and page heading.
 */
function createPage(title: string, subtype: string, body: string): string {
  return `---
title: ${title}
type: entity
subtype: ${subtype}
status: draft
---

# ${title}

${body}
`;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("findMergeCandidates", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-merge-test-"));

    // Create fixture pages:
    //   - Two pages with the same title "Gandalf" (candidates for strategy A)
    //   - One unique page "Aragorn"
    //   - One unique page "Battle" in a concept folder
    writePage(
      "entities/characters/gandalf.md",
      createPage("Gandalf", "character", "A wizard of the Istari order."),
    );
    writePage(
      "entities/characters/gandalf-alt.md",
      createPage("Gandalf", "character", "The same wizard in a different file."),
    );
    writePage(
      "entities/characters/aragorn.md",
      createPage("Aragorn", "character", "A ranger of the North."),
    );
    writePage(
      "concepts/events/battle.md",
      createPage("Battle", "event", "A battle between forces."),
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Strategy A — Same title
  // -----------------------------------------------------------------------

  it("finds duplicates with the same title (strategy A)", () => {
    const candidates = findMergeCandidates(tmpDir, { strategy: "A", limit: 10 });
    // Expect at least one pair (the two Gandalf pages)
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.some((c) => c.strategy === "A")).toBe(true);
  });

  it("returns the Gandalf duplicate pair with high confidence", () => {
    const candidates = findMergeCandidates(tmpDir, { strategy: "A", limit: 10 });
    // Two Gandalf pages → one pair
    expect(candidates.length).toBe(1);
    const pair = candidates[0];
    expect(pair.confidence).toBeGreaterThan(0.9);
    expect(pair.reason).toContain("Same title");
    expect(pair.strategy).toBe("A");
  });

  it("respects the limit parameter (strategy A)", () => {
    // Add a third page with title "Gandalf" to create 3 possible pairs
    writePage(
      "concepts/events/e2.md",
      createPage("Gandalf", "event", "Another page about Gandalf."),
    );
    const candidates = findMergeCandidates(tmpDir, { strategy: "A", limit: 1 });
    expect(candidates.length).toBe(1);
  });

  it("returns multiple pairs when more than two pages share a title", () => {
    // beforeEach creates 2 Gandalf pages. Adding 2 more → 4 total → C(4,2) = 6 pairs
    writePage(
      "concepts/events/e2.md",
      createPage("Gandalf", "event", "Another Gandalf page."),
    );
    writePage(
      "entities/items/gandalf.md",
      createPage("Gandalf", "item", "Yet another Gandalf page."),
    );
    const candidates = findMergeCandidates(tmpDir, { strategy: "A", limit: 10 });
    // With 4 pages, nC2 = 6 pairs
    expect(candidates.length).toBe(6);
  });

  it("handles title case insensitivity", () => {
    // gandalf the grey vs Gandalf should be treated as same title
    writePage(
      "entities/characters/gandalf-gray.md",
      createPage("gandalf the grey", "character", "Same wizard."),
    );
    writePage(
      "entities/characters/gandalf-white.md",
      createPage("Gandalf the Grey", "character", "Same wizard, upgraded."),
    );
    const candidates = findMergeCandidates(tmpDir, { strategy: "A", limit: 10 });
    expect(candidates.some((c) => c.reason.toLowerCase().includes("gandalf the grey"))).toBe(true);
  });

  it("returns empty array when no duplicate titles exist", () => {
    // Remove all Gandalf pages so only Aragorn and Battle remain (unique titles)
    fs.rmSync(path.join(tmpDir, "entities/characters/gandalf.md"));
    fs.rmSync(path.join(tmpDir, "entities/characters/gandalf-alt.md"));

    const candidates = findMergeCandidates(tmpDir, { strategy: "A", limit: 10 });
    expect(candidates.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Strategy B — Wikilink overlap
  // -----------------------------------------------------------------------

  it("finds merge candidates with high wikilink overlap (strategy B)", () => {
    // Create pages with shared wikilinks
    writePage(
      "entities/characters/frodo.md",
      createPage(
        "Frodo",
        "character",
        "Related to [[Gandalf]] and [[Aragorn]] and [[Battle]].",
      ),
    );
    writePage(
      "entities/characters/bilbo.md",
      createPage(
        "Bilbo",
        "character",
        "Related to [[Gandalf]] and [[Aragorn]] and [[Battle]].",
      ),
    );
    writePage(
      "entities/characters/sam.md",
      createPage("Sam", "character", "Related to [[Gandalf]] only."),
    );

    const candidates = findMergeCandidates(tmpDir, { strategy: "B", limit: 10 });
    // Frodo and Bilbo share 3/3 links = 100% overlap
    expect(candidates.some((c) => c.confidence >= 0.8 && c.strategy === "B")).toBe(true);
  });

  it("correctly computes Jaccard similarity for partial overlap", () => {
    // Frodo and Bilbo share 3 links each → intersection=3, union=3 → J=1.0
    writePage(
      "entities/characters/frodo.md",
      createPage(
        "Frodo",
        "character",
        "Links: [[Gandalf]] [[Aragorn]] [[Battle]].",
      ),
    );
    writePage(
      "entities/characters/bilbo.md",
      createPage(
        "Bilbo",
        "character",
        "Links: [[Gandalf]] [[Aragorn]] [[Battle]].",
      ),
    );
    // Sam shares 1/3 with each → J=0.333 — below threshold
    writePage(
      "entities/characters/sam.md",
      createPage("Sam", "character", "Links: [[Gandalf]]."),
    );

    const candidates = findMergeCandidates(tmpDir, { strategy: "B", limit: 10 });
    // Frodo/Bilbo pair should be present with J >= 0.8
    const frodoBilbo = candidates.find(
      (c) =>
        c.pageA.includes("frodo") ||
        c.pageA.includes("bilbo") ||
        c.pageB.includes("frodo") ||
        c.pageB.includes("bilbo"),
    );
    expect(frodoBilbo).toBeDefined();
    expect(frodoBilbo!.confidence).toBeGreaterThanOrEqual(0.8);

    // Sam should not appear in any pair (J=0.333 < 0.8)
    const samPairs = candidates.filter(
      (c) => c.pageA.includes("sam") || c.pageB.includes("sam"),
    );
    expect(samPairs.length).toBe(0);
  });

  it("skips pages with no wikilinks in strategy B", () => {
    // Frodo has wikilinks, Aragorn does not
    writePage(
      "entities/characters/frodo.md",
      createPage("Frodo", "character", "Related to [[Gandalf]] and [[Aragorn]]."),
    );
    // Aragorn has no wikilinks — should be skipped
    // (aragorn.md already exists from beforeEach without wikilinks)

    const candidates = findMergeCandidates(tmpDir, { strategy: "B", limit: 10 });
    // Only Frodo has wikilinks, so no pairs can form
    const frodoPairs = candidates.filter((c) => c.pageA.includes("frodo") || c.pageB.includes("frodo"));
    expect(frodoPairs.length).toBe(0);
  });

  it("strategy B handles unreadable files gracefully", () => {
    // Create a file that exists but is unreadable
    writePage(
      "entities/characters/frodo.md",
      createPage("Frodo", "character", "Related to [[Gandalf]]."),
    );
    // Remove read permission (best-effort on platforms that support it)
    try {
      fs.chmodSync(path.join(tmpDir, "entities/characters/frodo.md"), 0o000);
    } catch {
      // On Windows, chmod may not work as expected — skip permission test
    }

    // Should not throw
    const candidates = findMergeCandidates(tmpDir, { strategy: "B", limit: 10 });
    expect(Array.isArray(candidates)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Strategy C — LLM stub
  // -----------------------------------------------------------------------

  it("strategy C returns results (stub returns B's output)", () => {
    const candidates = findMergeCandidates(tmpDir, { strategy: "C", limit: 10 });
    // Strategy C is a stub that returns B's results filtered by limit
    expect(Array.isArray(candidates)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Default behavior
  // -----------------------------------------------------------------------

  it("defaults to strategy A with limit 20", () => {
    const candidates = findMergeCandidates(tmpDir);
    // Default is strategy A — should find the Gandalf pair
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].strategy).toBe("A");
  });

  it("returns empty array for empty wiki root", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-empty-merge-"));
    try {
      const candidates = findMergeCandidates(emptyDir);
      expect(candidates).toEqual([]);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("includes dormant pages when scanning", () => {
    // Create a dormant duplicate
    writePage(
      "entities/characters/gandalf-dormant.md",
      `---
title: Gandalf
type: entity
subtype: character
status: dormant
---

# Gandalf

A dormant copy.
`,
    );
    const candidates = findMergeCandidates(tmpDir, { strategy: "A", limit: 10 });
    // Should find 1 pair (the original two) plus pairs involving dormant → 3 total
    // Original: gandalf.md, gandalf-alt.md, plus gandalf-dormant.md → nC2 = 3 pairs
    expect(candidates.length).toBe(3);
  });
});
