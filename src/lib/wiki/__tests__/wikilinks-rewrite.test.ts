import { describe, it, expect } from "bun:test";
import {
  rewriteLinksForPageMove,
  resolveWikilink,
  resolveWikilinkWithRedirect,
  detectCollisions,
} from "../wikilinks";
import type { WikiPage } from "../types";

describe("rewriteLinksForPageMove", () => {
  it("rewrites a path-based wikilink when the folder changes", () => {
    const content = "See [[entities/foo]] for details.";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("See [[characters/foo]] for details.");
  });

  it("preserves the alias when rewriting", () => {
    const content = "Check out [[entities/foo|the Foo]].";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("Check out [[characters/foo|the Foo]].");
  });

  it("rewrites embeds with the same folder prefix", () => {
    const content = "Block: ![[entities/foo]]";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("Block: ![[characters/foo]]");
  });

  it("matches by title (case-insensitive)", () => {
    const content = "Link to [[entities/Foo]]";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("Link to [[characters/Foo]]");
  });

  it("matches by filename (case-insensitive)", () => {
    const content = "Link to [[entities/Foo]]";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Title",
      "foo",
    );
    expect(result).toBe("Link to [[characters/Foo]]");
  });

  it("does NOT rewrite a link to a different page in the same old folder", () => {
    const content = "Other page: [[entities/bar]]";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("Other page: [[entities/bar]]");
  });

  it("leaves bare-name links alone (they resolve via 3-pass)", () => {
    const content = "See [[foo]] and [[Foo]].";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("See [[foo]] and [[Foo]].");
  });

  it("leaves cross-universe namespace links alone", () => {
    const content = "Cross: [[OtherUniverse::Foo]]";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("Cross: [[OtherUniverse::Foo]]");
  });

  it("returns the original content when old and new folders match", () => {
    const content = "See [[entities/foo]]";
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "entities",
      "Foo",
      "foo",
    );
    expect(result).toBe(content);
  });

  it("does not match when old folder is a prefix of a different folder name", () => {
    // oldFolder is "entity"; the link points to "entities/foo" (plural folder).
    // The function should NOT rewrite this because "entities/" !== "entity/".
    const content = "Other: [[entities/foo]]";
    const result = rewriteLinksForPageMove(
      content,
      "entity",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe("Other: [[entities/foo]]");
  });

  it("handles multiple links in the same content", () => {
    const content = [
      "Intro: [[entities/foo]]",
      "Other: [[entities/bar]]",
      "Bare: [[foo]]",
      "Embed: ![[entities/foo]]",
    ].join("\n");
    const result = rewriteLinksForPageMove(
      content,
      "entities",
      "characters",
      "Foo",
      "foo",
    );
    expect(result).toBe([
      "Intro: [[characters/foo]]",
      "Other: [[entities/bar]]",
      "Bare: [[foo]]",
      "Embed: ![[characters/foo]]",
    ].join("\n"));
  });

  // ---- 2-level folder move tests ----

  it("rewrites links when moving between subtype folders within the same type", () => {
    const content = "See [[entities/characters/gandalf]] for details.";
    expect(rewriteLinksForPageMove(content, "entities/characters", "entities/locations", "Gandalf", "gandalf"))
      .toBe("See [[entities/locations/gandalf]] for details.");
  });

  it("rewrites links when moving from top-level folder into a subtype subfolder", () => {
    const content = "See [[entities/gandalf]] for details.";
    expect(rewriteLinksForPageMove(content, "entities", "entities/characters", "Gandalf", "gandalf"))
      .toBe("See [[entities/characters/gandalf]] for details.");
  });

  it("rewrites links when moving from subtype subfolder to top-level folder", () => {
    const content = "See [[entities/characters/gandalf]] for details.";
    expect(rewriteLinksForPageMove(content, "entities/characters", "entities", "Gandalf", "gandalf"))
      .toBe("See [[entities/gandalf]] for details.");
  });

  it("rewrites links when moving between different types with subtypes", () => {
    const content = "[[entities/characters/gandalf]] is powerful.";
    expect(rewriteLinksForPageMove(content, "entities/characters", "concepts/events", "Gandalf", "gandalf"))
      .toBe("[[concepts/events/gandalf]] is powerful.");
  });

  it("does NOT rewrite 2-level links when oldFolder prefix doesn't match the link", () => {
    const content = "[[entities/items/sting]] is a weapon.";
    expect(rewriteLinksForPageMove(content, "entities/characters", "entities/locations", "Gandalf", "gandalf"))
      .toBe("[[entities/items/sting]] is a weapon.");
  });

  it("only rewrites links matching the moved page in 2-level folders", () => {
    const content = "[[entities/characters/gandalf]] and [[entities/characters/frodo]].";
    expect(rewriteLinksForPageMove(content, "entities/characters", "entities/locations", "Gandalf", "gandalf"))
      .toBe("[[entities/locations/gandalf]] and [[entities/characters/frodo]].");
  });
});

// ---------------------------------------------------------------------------
// superseded_by resolution
// ---------------------------------------------------------------------------

describe("superseded_by resolution", () => {
  // Helper: create a WikiPage fixture with absolute paths like readWikiPage returns.
  function makePage(
    relPath: string,
    title: string,
    options?: { universe?: string; supersededBy?: string },
  ): WikiPage {
    return {
      path: `C:/wiki/${relPath}`,
      content: "",
      frontmatter: {
        title,
        type: "concept",
        status: "draft",
        universe: options?.universe,
        superseded_by: options?.supersededBy,
      },
    };
  }

  it("resolves a superseded page to its replacement", () => {
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf the White"),
      makePage(
        "entities/characters/gandalf-dup.md",
        "Gandalf the Grey",
        { supersededBy: "entities/characters/gandalf.md" },
      ),
    ];

    const result = resolveWikilink("Gandalf the Grey", pages);
    expect(result).toBe("C:/wiki/entities/characters/gandalf.md");
  });

  it("still resolves a page that is not superseded", () => {
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf"),
    ];

    const result = resolveWikilink("Gandalf", pages);
    expect(result).toBe("C:/wiki/entities/characters/gandalf.md");
  });

  it("returns redirectedFrom when following superseded_by", () => {
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf the White"),
      makePage(
        "entities/characters/gandalf-dup.md",
        "Gandalf the Grey",
        { supersededBy: "entities/characters/gandalf.md" },
      ),
    ];

    const result = resolveWikilinkWithRedirect("Gandalf the Grey", pages);
    expect(result).toEqual({
      path: "C:/wiki/entities/characters/gandalf.md",
      title: "Gandalf the White",
      redirectedFrom: "Gandalf the Grey",
    });
  });

  it("returns no redirectedFrom when there is no superseded_by", () => {
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf the White"),
    ];

    const result = resolveWikilinkWithRedirect("Gandalf the White", pages);
    expect(result).toEqual({
      path: "C:/wiki/entities/characters/gandalf.md",
      title: "Gandalf the White",
    });
    expect(result!.redirectedFrom).toBeUndefined();
  });

  it("does not infinitely loop on superseded_by chains (one hop max)", () => {
    // A → B → C: resolving "Page A" should follow A → B and stop at B.
    const pages = [
      makePage("entities/c.md", "Page C"),
      makePage("entities/b.md", "Page B", { supersededBy: "entities/c.md" }),
      makePage("entities/a.md", "Page A", { supersededBy: "entities/b.md" }),
    ];

    const result = resolveWikilink("Page A", pages);
    // One hop: A → B (not A → B → C)
    expect(result).toBe("C:/wiki/entities/b.md");
  });

  it("does not crash when superseded_by target is missing", () => {
    const pages = [
      makePage(
        "entities/old.md",
        "Old Page",
        { supersededBy: "entities/nonexistent.md" },
      ),
    ];

    const result = resolveWikilink("Old Page", pages);
    // Target doesn't exist — return original path
    expect(result).toBe("C:/wiki/entities/old.md");
  });

  it("resolveWikilinkWithRedirect returns null for unresolvable links", () => {
    const result = resolveWikilinkWithRedirect("Nonexistent", []);
    expect(result).toBeNull();
  });

  it("detectCollisions excludes cross-universe superseded pairs", () => {
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf", { universe: "books" }),
      makePage(
        "entities/characters/gandalf-dup.md",
        "Gandalf",
        { universe: "movies", supersededBy: "entities/characters/gandalf.md" },
      ),
    ];

    // Without the superseded_by filter, this would be a cross-universe collision.
    // The superseded entry (movies) is excluded, leaving only one entry.
    const collisions = detectCollisions(pages);
    expect(collisions).toHaveLength(0);
  });

  it("detectCollisions keeps real cross-universe collisions", () => {
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf", { universe: "books" }),
      makePage("entities/characters/gandalf-movie.md", "Gandalf", { universe: "movies" }),
    ];

    const collisions = detectCollisions(pages);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].pages).toContain("C:/wiki/entities/characters/gandalf.md");
    expect(collisions[0].pages).toContain("C:/wiki/entities/characters/gandalf-movie.md");
  });

  it("detectCollisions keeps cross-universe collision when superseded pair plus third universe exist", () => {
    // Scenario: books universe has the canonical "Gandalf", movies universe has
    // a superseded duplicate that points to the books page, and games universe
    // has an independent "Gandalf". The collision should still be reported
    // between books and games (the superseded movies entry is excluded).
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf", { universe: "books" }),
      makePage(
        "entities/characters/gandalf-movies.md",
        "Gandalf",
        { universe: "movies", supersededBy: "entities/characters/gandalf.md" },
      ),
      makePage("entities/characters/gandalf-games.md", "Gandalf", { universe: "games" }),
    ];

    const collisions = detectCollisions(pages);
    expect(collisions).toHaveLength(1);
    // The superseded movies entry should NOT appear in the collision
    expect(collisions[0].pages).toEqual(
      expect.arrayContaining([
        "C:/wiki/entities/characters/gandalf.md",
        "C:/wiki/entities/characters/gandalf-games.md",
      ]),
    );
    expect(collisions[0].pages).not.toContain("C:/wiki/entities/characters/gandalf-movies.md");
  });

  it("redirects a filename-based wikilink to a superseded page", () => {
    // Wikilink [[gandalf-dup]] (filename-based) should redirect to the superseding page
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf the White"),
      makePage(
        "entities/characters/gandalf-dup.md",
        "Gandalf the Grey",
        { supersededBy: "entities/characters/gandalf.md" },
      ),
    ];

    const result = resolveWikilink("gandalf-dup", pages);
    expect(result).toBe("C:/wiki/entities/characters/gandalf.md");
  });

  it("triggers resolveWikilinkWithRedirect redirectedFrom via filename match", () => {
    const pages = [
      makePage("entities/characters/gandalf.md", "Gandalf the White"),
      makePage(
        "entities/characters/gandalf-dup.md",
        "Gandalf the Grey",
        { supersededBy: "entities/characters/gandalf.md" },
      ),
    ];

    // Link via filename (which matches Pass 3)
    const result = resolveWikilinkWithRedirect("gandalf-dup", pages);
    expect(result).not.toBeNull();
    expect(result!.redirectedFrom).toBe("Gandalf the Grey");
    expect(result!.path).toBe("C:/wiki/entities/characters/gandalf.md");
  });
});
