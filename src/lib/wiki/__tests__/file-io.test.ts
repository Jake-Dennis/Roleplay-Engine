import { describe, it, expect, beforeEach, afterEach, beforeAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * NOTE: We do NOT statically import listWikiPages from "../file-io".
 * The npc-wiki-sync.test.ts file registers a global mock.module("@/lib/wiki/file-io")
 * that persists across the entire bun test run. To get the real implementation,
 * we use a cache-busting dynamic import in beforeAll.
 */

let listWikiPages: (wikiRoot: string, options?: { includeDormant?: boolean }) => any[];
let TEST_ROOT: string;

beforeAll(async () => {
  const realPath = path.resolve(import.meta.dir, "../file-io.ts");
  const mod = await import(realPath + "?v=" + Date.now());
  listWikiPages = mod.listWikiPages;
});

function writePage(relPath: string, frontmatter: Record<string, unknown>, body = ""): void {
  const fullPath = path.join(TEST_ROOT, relPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const content = `---\n${yaml}\n---\n\n${body}`;
  fs.writeFileSync(fullPath, content, "utf-8");
}

function createPage(title: string, type: string, subtype?: string, order?: number, status?: string): Record<string, unknown> {
  const fm: Record<string, unknown> = { title, type, status: status ?? "draft" };
  if (subtype) fm.subtype = subtype;
  if (order !== undefined) fm.order = order;
  return fm;
}

describe("listWikiPages (subfolder-aware)", () => {
  beforeEach(() => {
    TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-file-io-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it("returns empty array for non-existent root", () => {
    const pages = listWikiPages(path.join(TEST_ROOT, "nonexistent"));
    expect(pages).toEqual([]);
  });

  it("returns empty array for root with no wiki structure", () => {
    // Empty directory — no entities/concepts/etc folders
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toEqual([]);
  });

  it("finds pages in flat folders", () => {
    writePage("entities/gandalf.md", createPage("Gandalf", "entity", "character"));
    writePage("entities/aragorn.md", createPage("Aragorn", "entity", "character"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(2);
  });

  it("finds pages in 2-level subtype folders", () => {
    writePage("entities/characters/gandalf.md", createPage("Gandalf", "entity", "character"));
    writePage("entities/locations/shire.md", createPage("Shire", "entity", "location"));
    writePage("concepts/events/battle.md", createPage("Battle", "concept", "event"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(3);
  });

  it("skips hidden directories", () => {
    writePage("entities/.hidden/gandalf.md", createPage("Gandalf", "entity", "character"));
    writePage("entities/characters/aragorn.md", createPage("Aragorn", "entity", "character"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(1);
  });

  it("skips system directories (_review, _archive, conflicts, node_modules)", () => {
    writePage("entities/_review/gandalf.md", createPage("Gandalf", "entity", "character"));
    writePage("entities/_archive/old.md", createPage("Old", "entity", "character"));
    writePage("entities/conflicts/gandalf-conflict.md", createPage("Gandalf", "entity", "character"));
    writePage("synthesis/node_modules/test.md", createPage("Test", "synthesis"));
    writePage("entities/characters/legolas.md", createPage("Legolas", "entity", "character"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(1);
  });

  it("sorts by top-level folder, then subtype folder, then order, then title", () => {
    writePage("concepts/events/z-event.md", createPage("Z Event", "concept", "event", 2));
    writePage("entities/characters/aragorn.md", createPage("Aragorn", "entity", "character", 1));
    writePage("entities/characters/gandalf.md", createPage("Gandalf", "entity", "character", 2));
    writePage("entities/locations/shire.md", createPage("Shire", "entity", "location", 1));
    writePage("synthesis/summary.md", createPage("Summary", "synthesis"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(5);
    // With no .wiki-config.json, getResolvedFolderOrder returns
    // folders alphabetically: concepts, entities, synthesis
    // concepts/events comes first (alphabetically first folder)
    expect(pages[0].frontmatter.title).toBe("Z Event");
    // entities/characters (order=1 before order=2)
    expect(pages[1].frontmatter.title).toBe("Aragorn");
    expect(pages[2].frontmatter.title).toBe("Gandalf");
    // entities/locations
    expect(pages[3].frontmatter.title).toBe("Shire");
    // synthesis
    expect(pages[4].frontmatter.title).toBe("Summary");
  });

  it("handles mixed flat and 2-level pages", () => {
    writePage("entities/old-entity.md", createPage("OldEntity", "entity"));
    writePage("entities/characters/gandalf.md", createPage("Gandalf", "entity", "character"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(2);
  });

  it("handles deeply nested 3-level subdirectories", () => {
    // 3+ levels deep should also be discovered
    writePage("entities/characters/wizards/gandalf.md", createPage("Gandalf", "entity", "character"));
    writePage("entities/characters/hobbits/frodo.md", createPage("Frodo", "entity", "character"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(2);
  });

  it("skips non-md files", () => {
    // Write a .txt file (should be skipped)
    const txtPath = path.join(TEST_ROOT, "entities", "notes.txt");
    fs.mkdirSync(path.dirname(txtPath), { recursive: true });
    fs.writeFileSync(txtPath, "Some notes.\n", "utf-8");

    // Write a valid page
    writePage("entities/characters/gandalf.md", createPage("Gandalf", "entity", "character"));

    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(1);
    expect(pages[0].frontmatter.title).toBe("Gandalf");
  });

  it("preserves absolute paths on returned pages", () => {
    writePage("entities/characters/gandalf.md", createPage("Gandalf", "entity", "character"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(1);
    // The path should be an absolute path ending with the correct filename
    expect(pages[0].path).toBe(path.join(TEST_ROOT, "entities", "characters", "gandalf.md"));
  });

  it("returns correct content and frontmatter", () => {
    writePage("entities/characters/gandalf.md", createPage("Gandalf", "entity", "character"), "Gandalf was a wizard.");
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(1);
    expect(pages[0].frontmatter.title).toBe("Gandalf");
    expect(pages[0].frontmatter.type).toBe("entity");
    expect(pages[0].frontmatter.subtype).toBe("character");
    expect(pages[0].content.trim()).toBe("Gandalf was a wizard.");
  });

  it("excludes dormant pages by default", () => {
    writePage("entities/characters/active.md", createPage("Active", "entity", "character", undefined, "draft"));
    writePage("entities/characters/dormant.md", createPage("Dormant", "entity", "character", undefined, "dormant"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(1);
    expect(pages[0].frontmatter.title).toBe("Active");
  });

  it("includes dormant pages when includeDormant=true", () => {
    writePage("entities/characters/active.md", createPage("Active", "entity", "character", undefined, "draft"));
    writePage("entities/characters/dormant.md", createPage("Dormant", "entity", "character", undefined, "dormant"));
    const pages = listWikiPages(TEST_ROOT, { includeDormant: true });
    expect(pages).toHaveLength(2);
  });

  it("excludes only dormant pages — other statuses remain visible", () => {
    writePage("entities/characters/draft.md", createPage("Draft", "entity", "character", undefined, "draft"));
    writePage("entities/characters/reviewed.md", createPage("Reviewed", "entity", "character", undefined, "reviewed"));
    writePage("entities/characters/locked.md", createPage("Locked", "entity", "character", undefined, "locked"));
    writePage("entities/characters/rejected.md", createPage("Rejected", "entity", "character", undefined, "rejected"));
    writePage("entities/characters/dormant.md", createPage("Dormant", "entity", "character", undefined, "dormant"));
    const pages = listWikiPages(TEST_ROOT);
    expect(pages).toHaveLength(4);
    const titles = pages.map((p) => p.frontmatter.title).sort();
    expect(titles).toEqual(["Draft", "Locked", "Rejected", "Reviewed"]);
  });
});
