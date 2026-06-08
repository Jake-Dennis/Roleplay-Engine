/**
 * Tests for the from-scratch markdown syntax highlighter.
 *
 * 23 cases covering:
 *   - block tokens: headings, lists, blockquote, callout, code block, hr, frontmatter
 *   - inline tokens: bold/italic/strike, code, wikilink, embed, link, image, tag, escape
 *   - safety: HTML escape, no raw script tags
 *   - edge cases: empty, whitespace, multi-line
 */
import { describe, it, expect } from "bun:test";
import { highlightMarkdown } from "@/lib/wiki/syntax-highlighter";

// ===========================================================================
// Block tokens
// ===========================================================================

describe("highlightMarkdown", () => {
  it("returns a single newline for empty input", () => {
    expect(highlightMarkdown("")).toBe("\n");
  });

  it("emits plain text wrapped in a trailing newline", () => {
    const out = highlightMarkdown("Hello world");
    expect(out).toContain("Hello world");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("tokenizes heading levels 1-6", () => {
    for (let n = 1; n <= 6; n++) {
      const hashes = "#".repeat(n);
      const out = highlightMarkdown(`${hashes} Title ${n}`);
      expect(out).toContain(`tok-h${n}`);
      expect(out).toContain(`Title ${n}`);
    }
  });

  it("tokenizes bold, italic, and strike", () => {
    const out = highlightMarkdown("**bold** and *italic* and ~~strike~~");
    expect(out).toContain("tok-bold");
    expect(out).toContain("tok-italic");
    expect(out).toContain("tok-strike");
    expect(out).toContain("bold");
    expect(out).toContain("italic");
    expect(out).toContain("strike");
  });

  it("tokenizes inline code", () => {
    const out = highlightMarkdown("Some `inline code` here");
    expect(out).toContain("tok-code");
    expect(out).toContain("inline code");
  });

  it("tokenizes fenced code blocks with opening, content, and closing spans", () => {
    const md = "```js\nconst x = 1;\n```";
    const out = highlightMarkdown(md);
    expect(out).toContain("tok-code-block");
    expect(out).toContain("tok-code-content");
    expect(out).toContain("const x = 1;");
  });

  // =========================================================================
  // Wikilinks and embeds
  // =========================================================================

  it("tokenizes a plain wikilink", () => {
    const out = highlightMarkdown("See [[Elara Vance]] for details.");
    expect(out).toContain("tok-wikilink");
    expect(out).toContain("Elara Vance");
  });

  it("tokenizes a wikilink with an alias", () => {
    const out = highlightMarkdown("See [[Elara|Elara Vance]] here.");
    expect(out).toContain("tok-wikilink");
  });

  it("tokenizes an embed wikilink", () => {
    const out = highlightMarkdown("![[embedded-page]]");
    expect(out).toContain("tok-embed");
    expect(out).toContain("embedded-page");
  });

  // =========================================================================
  // Standard markdown links and images
  // =========================================================================

  it("tokenizes a markdown link with text and url spans", () => {
    const out = highlightMarkdown("Click [here](https://example.com) please");
    expect(out).toContain("tok-link-text");
    expect(out).toContain("tok-link-url");
    expect(out).toContain("here");
  });

  it("tokenizes an image with alt and url spans", () => {
    const out = highlightMarkdown("![alt text](image.png)");
    expect(out).toContain("tok-image-alt");
    expect(out).toContain("tok-image-url");
    expect(out).toContain("alt text");
  });

  // =========================================================================
  // Lists
  // =========================================================================

  it("tokenizes unordered list items", () => {
    const out = highlightMarkdown("- item one\n- item two\n- item three");
    expect(out).toContain("tok-list-marker");
    expect(out).toContain("item one");
  });

  it("tokenizes ordered list items", () => {
    const out = highlightMarkdown("1. first\n2. second\n3. third");
    expect(out).toContain("tok-list-marker");
    expect(out).toContain("first");
  });

  it("tokenizes checkbox list items", () => {
    const out = highlightMarkdown("- [ ] todo\n- [x] done");
    expect(out).toContain("tok-checkbox");
  });

  // =========================================================================
  // Blockquote, callout, horizontal rule
  // =========================================================================

  it("tokenizes a plain blockquote", () => {
    const out = highlightMarkdown("> A wise saying.");
    expect(out).toContain("tok-quote");
    expect(out).toContain("A wise saying");
  });

  it("tokenizes a callout with type and title spans", () => {
    const out = highlightMarkdown("> [!note] A note title\n> Body of the callout");
    expect(out).toContain("tok-callout-type");
    expect(out).toContain("tok-callout-title");
    expect(out).toContain("note");
  });

  it("tokenizes a horizontal rule", () => {
    const out = highlightMarkdown("---");
    expect(out).toContain("tok-hr");
  });

  // =========================================================================
  // Inline misc: tag, escape
  // =========================================================================

  it("tokenizes a #tag reference", () => {
    const out = highlightMarkdown("This is a #mytag reference");
    expect(out).toContain("tok-tag");
    expect(out).toContain("#mytag");
  });

  it("tokenizes a frontmatter block at the top of the document", () => {
    const md = "---\ntitle: Foo\ntype: entity\nstatus: draft\n---\n\n# Heading\n\nBody";
    const out = highlightMarkdown(md);
    expect(out).toContain("tok-fm-delim");
    expect(out).toContain("tok-fm-content");
    expect(out).toContain("title: Foo");
    expect(out).toContain("tok-h1");
  });

  // =========================================================================
  // Safety
  // =========================================================================

  it("escapes HTML in user content — no raw <script> tags survive", () => {
    const out = highlightMarkdown('<script>alert("xss")</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&quot;");
    expect(out).not.toContain('alert("xss")');
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  it("always emits a trailing newline (single, terminated, double-blank)", () => {
    expect(highlightMarkdown("foo").endsWith("\n")).toBe(true);
    expect(highlightMarkdown("foo\n").endsWith("\n")).toBe(true);
    expect(highlightMarkdown("foo\n\n").endsWith("\n")).toBe(true);
  });

  it("tokenizes backslash-escaped punctuation as an escape", () => {
    const out = highlightMarkdown("This is \\*not italic\\*");
    expect(out).toContain("tok-escape");
  });

  it("renders a multi-line document with mixed block + inline tokens", () => {
    const md = `# Title

A paragraph with **bold** and a [[link]].

- list item
- [ ] todo

> [!warning]
> Important note

\`\`\`js
const x = 1;
\`\`\``;
    const out = highlightMarkdown(md);
    expect(out).toContain("tok-h1");
    expect(out).toContain("tok-bold");
    expect(out).toContain("tok-wikilink");
    expect(out).toContain("tok-list-marker");
    expect(out).toContain("tok-checkbox");
    expect(out).toContain("tok-callout-type");
    expect(out).toContain("tok-code-block");
  });
});
