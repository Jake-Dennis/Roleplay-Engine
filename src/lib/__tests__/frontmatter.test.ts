/**
 * Tests for the frontmatter utility module — wraps gray-matter for parse and
 * serialize, plus a validateWikiFrontmatter helper.
 *
 * 12 cases covering:
 *   - parse with valid YAML, no frontmatter, empty string, single-string tags
 *   - serialize round-trip
 *   - validate happy path, missing title, invalid type, invalid status
 *   - EMPTY_FRONTMATTER shape
 *   - serialize starts with ---
 *   - parse preserves created/updated ISO timestamps
 */
import { describe, it, expect } from "bun:test";
import {
  parseWikiFrontmatter,
  serializeWikiFrontmatter,
  validateWikiFrontmatter,
  EMPTY_FRONTMATTER,
} from "@/lib/wiki/frontmatter";
import type { WikiFrontmatter } from "@/lib/wiki/types";

// ===========================================================================
// parseWikiFrontmatter
// ===========================================================================
describe("parseWikiFrontmatter", () => {
  it("parses a valid YAML frontmatter block", () => {
    const raw =
      "---\ntitle: Elara\ntype: entity\nstatus: draft\ntags:\n  - hero\n  - mage\n---\n\nBody content here.";
    const { frontmatter, body } = parseWikiFrontmatter(raw);
    expect(frontmatter.title).toBe("Elara");
    expect(frontmatter.type).toBe("entity");
    expect(frontmatter.status).toBe("draft");
    expect(frontmatter.tags).toEqual(["hero", "mage"]);
    expect(body).toBe("Body content here.");
  });

  it("returns EMPTY_FRONTMATTER when no frontmatter is present", () => {
    const raw = "Just some content without any frontmatter.";
    const { frontmatter, body } = parseWikiFrontmatter(raw);
    expect(frontmatter).toEqual(EMPTY_FRONTMATTER);
    expect(body).toBe(raw);
  });

  it("returns EMPTY_FRONTMATTER and empty body for empty input", () => {
    const { frontmatter, body } = parseWikiFrontmatter("");
    expect(frontmatter).toEqual(EMPTY_FRONTMATTER);
    expect(body).toBe("");
  });

  it("coerces a single-string tags field into a one-element array", () => {
    const raw = "---\ntitle: Foo\ntype: concept\nstatus: draft\ntags: only-one\n---\n\nBody.";
    const { frontmatter } = parseWikiFrontmatter(raw);
    expect(frontmatter.tags).toEqual(["only-one"]);
  });

  it("preserves created/updated ISO timestamps from the frontmatter block", () => {
    // gray-matter (via js-yaml) parses unquoted ISO 8601 timestamps as Date
    // objects, which is the form other wiki consumers (lint, revisions)
    // expect to wrap with `new Date(...)`. We assert the time value is
    // preserved.
    const raw =
      "---\ntitle: X\ntype: concept\nstatus: draft\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-06-01T00:00:00.000Z\n---\n\nBody.";
    const { frontmatter } = parseWikiFrontmatter(raw);
    expect(frontmatter.created).toBeInstanceOf(Date);
    expect(frontmatter.updated).toBeInstanceOf(Date);
    expect((frontmatter.created as Date).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
    expect((frontmatter.updated as Date).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z"
    );
  });
});

// ===========================================================================
// serializeWikiFrontmatter
// ===========================================================================
describe("serializeWikiFrontmatter", () => {
  it("round-trips body and frontmatter through parse/serialize", () => {
    const body = "# Heading\n\nSome content.";
    const fm: WikiFrontmatter = {
      title: "Test",
      type: "concept",
      status: "reviewed",
      tags: ["a", "b"],
      universe: "main",
    };
    const raw = serializeWikiFrontmatter(body, fm);
    const { frontmatter, body: parsedBody } = parseWikiFrontmatter(raw);
    expect(parsedBody).toBe(body);
    expect(frontmatter.title).toBe("Test");
    expect(frontmatter.type).toBe("concept");
    expect(frontmatter.status).toBe("reviewed");
    expect(frontmatter.tags).toEqual(["a", "b"]);
    expect(frontmatter.universe).toBe("main");
  });

  it("produces a string that starts with the YAML delimiter", () => {
    const raw = serializeWikiFrontmatter("body", {
      title: "X",
      type: "entity",
      status: "draft",
    });
    expect(raw.startsWith("---")).toBe(true);
  });
});

// ===========================================================================
// validateWikiFrontmatter
// ===========================================================================
describe("validateWikiFrontmatter", () => {
  it("returns an empty error array for valid frontmatter", () => {
    const errors = validateWikiFrontmatter({
      title: "X",
      type: "entity",
      status: "draft",
    });
    expect(errors).toEqual([]);
  });

  it("reports an error when title is missing or empty", () => {
    const errors = validateWikiFrontmatter({
      title: "",
      type: "entity",
      status: "draft",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /title/i.test(e))).toBe(true);
  });

  it("accepts any non-empty string for type (custom types allowed)", () => {
    const errors = validateWikiFrontmatter({
      title: "X",
      type: "location",
      status: "draft",
    });
    expect(errors.some((e) => /type/i.test(e))).toBe(false);
  });

  it("rejects empty string for type", () => {
    const errors = validateWikiFrontmatter({
      title: "X",
      type: "",
      status: "draft",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /type/i.test(e))).toBe(true);
  });

  it("reports an error when status is not in the allowed set", () => {
    const errors = validateWikiFrontmatter({
      title: "X",
      type: "entity",
      status: "weird" as any,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /status/i.test(e))).toBe(true);
  });
});

// ===========================================================================
// EMPTY_FRONTMATTER
// ===========================================================================
describe("EMPTY_FRONTMATTER", () => {
  it("has the three required fields populated with safe defaults", () => {
    expect(EMPTY_FRONTMATTER.title).toBeTruthy();
    expect(EMPTY_FRONTMATTER.type).toBe("concept");
    expect(EMPTY_FRONTMATTER.status).toBe("draft");
  });
});
