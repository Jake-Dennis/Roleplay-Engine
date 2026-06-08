import { describe, it, expect } from "bun:test";
import { rewriteLinksForPageMove } from "../wikilinks";

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
