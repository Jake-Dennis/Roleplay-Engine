/**
 * Tests for npc-wiki-sync pure helper functions.
 *
 * Tests buildTraitsSection and updateBodyTraitsSection directly.
 * These are exported pure functions (no module imports, no side effects).
 *
 * NOTE: Uses mock.module() ONLY for @/lib/db and @/lib/job-processor —
 * these load better-sqlite3 (native addon, can't run in Bun). No mock.module()
 * for file-io, logger, wiki-root, or validation — those don't load native
 * addons and would leak across test files.
 *
 * The handler (handleNpcWikiSync) is NOT tested here because its internal
 * imports (getDb, getWikiRoot, isLocked, etc.) would require mock.module()
 * for @/lib/wiki/file-io which leaks globally and breaks 5 other test files.
 * See AGENTS.md for the full explanation of this tradeoff.
 */

import { describe, it, expect, mock } from "bun:test";

// ===========================================================================
// mock.module() ONLY for modules with native addons (better-sqlite3)
// These DON'T leak because no OTHER test file imports these paths.
// ===========================================================================

mock.module("@/lib/db", () => ({
  getDb: () => null,
}));

mock.module("@/lib/job-processor", () => ({
  updateJobProgress: () => {},
  markJobCompleted: () => {},
}));

// ===========================================================================
// Import pure helper functions (they don't use any module imports internally)
// ===========================================================================

import {
  buildTraitsSection,
  updateBodyTraitsSection,
} from "../npc-wiki-sync";

// ===========================================================================
// Test data factories
// ===========================================================================

const TEST_NPC_ID = "npc-def456";

function makeNpc(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_NPC_ID,
    name: "Aldric Thornwood",
    description: "A seasoned knight with a troubled past.",
    personality_traits: null,
    behavior_patterns: null,
    ...overrides,
  };
}

// ===========================================================================
// buildTraitsSection
// ===========================================================================

describe("buildTraitsSection", () => {
  it("returns a traits section with JSON personality_traits formatted as list items", () => {
    const npc = makeNpc({
      personality_traits: JSON.stringify({
        bravery: 0.85,
        aggression: 0.42,
        loyalty: 0.91,
      }),
      behavior_patterns: null,
    });

    const result = buildTraitsSection(npc as any);

    expect(result).toContain("**Traits:**");
    expect(result).toContain("- bravery: 0.85");
    expect(result).toContain("- aggression: 0.42");
    expect(result).toContain("- loyalty: 0.91");
    expect(result).not.toContain("**Behavior Patterns:**");
  });

  it("includes behavior patterns when behavior_patterns is set", () => {
    const npc = makeNpc({
      personality_traits: JSON.stringify({ caution: 0.6 }),
      behavior_patterns: JSON.stringify([
        "avoids confrontation",
        "prefers ambushes",
      ]),
    });

    const result = buildTraitsSection(npc as any);

    expect(result).toContain("**Traits:**");
    expect(result).toContain("- caution: 0.6");
    expect(result).toContain("**Behavior Patterns:**");
    expect(result).toContain("- avoids confrontation");
    expect(result).toContain("- prefers ambushes");
  });

  it("outputs fallback '(no traits defined)' when personality_traits is null", () => {
    const npc = makeNpc({
      personality_traits: null,
      behavior_patterns: null,
    });

    const result = buildTraitsSection(npc as any);

    expect(result).toContain("- (no traits defined)");
  });

  it("includes raw string when personality_traits is not valid JSON", () => {
    const npc = makeNpc({
      personality_traits: "raw-trait-string",
      behavior_patterns: null,
    });

    const result = buildTraitsSection(npc as any);

    expect(result).toContain("- raw-trait-string");
  });

  it("includes behavior patterns even when personality_traits is null", () => {
    const npc = makeNpc({
      personality_traits: null,
      behavior_patterns: JSON.stringify(["stands firm"]),
    });

    const result = buildTraitsSection(npc as any);

    expect(result).toContain("- (no traits defined)");
    expect(result).toContain("**Behavior Patterns:**");
    expect(result).toContain("- stands firm");
  });
});

// ===========================================================================
// updateBodyTraitsSection
// ===========================================================================

describe("updateBodyTraitsSection", () => {
  const traitsSection =
    "**Traits:**\n- resolve: 0.95\n- caution: 0.30";

  it("replaces existing **Traits:** inline section and preserves surrounding content", () => {
    const body =
      "## Backstory\nAldric was born in the northern reaches.\n\n" +
      "**Traits:**\n- old_trait: 0.3\n- obsolete: 0.1\n\n" +
      "## Recent Events\nHe led the siege.\n";

    const result = updateBodyTraitsSection(body, traitsSection);

    expect(result).toContain("- resolve: 0.95");
    expect(result).not.toContain("- old_trait: 0.3");
    expect(result).not.toContain("- obsolete: 0.1");
    expect(result).toContain("## Backstory");
    expect(result).toContain("northern reaches");
    expect(result).toContain("## Recent Events");
    expect(result).toContain("He led the siege");
  });

  it("replaces ## Personality section when no inline **Traits:** exists", () => {
    const body =
      "## Appearance\nTall and broad-shouldered.\n\n" +
      "## Personality\nA brooding knight with a dark sense of humor.\n\n" +
      "## Background\nFrom the Thornwood lineage.\n";

    const result = updateBodyTraitsSection(body, traitsSection);

    expect(result).toContain("- resolve: 0.95");
    expect(result).not.toContain("## Personality");
    expect(result).toContain("## Appearance");
    expect(result).toContain("Tall and broad-shouldered");
    expect(result).toContain("## Background");
    expect(result).toContain("Thornwood lineage");
  });

  it("appends ## NPC Evolution section when neither **Traits:** nor ## Personality section exists", () => {
    const body =
      "## Background\nA brief background.\n\nSome additional notes.\n";

    const result = updateBodyTraitsSection(body, traitsSection);

    expect(result).toContain("## Background");
    expect(result).toContain("A brief background");
    expect(result).toContain("## NPC Evolution");
    expect(result).toContain("- resolve: 0.95");

    // Verify ordering
    const bgIdx = result.indexOf("## Background");
    const evoIdx = result.indexOf("## NPC Evolution");
    expect(evoIdx).toBeGreaterThan(bgIdx);
  });

  it("handles **Traits:** at end of file without trailing heading", () => {
    const body =
      "## Backstory\nAldric was born.\n\n" +
      "**Traits:**\n- old_trait: 0.3";

    const result = updateBodyTraitsSection(body, traitsSection);

    expect(result).toContain("- resolve: 0.95");
    expect(result).not.toContain("- old_trait: 0.3");
    expect(result).toContain("## Backstory");
  });

  it("handles ## Personality at end of file without trailing heading", () => {
    const body =
      "## Appearance\nTall.\n\n" +
      "## Personality\nBrooding knight.";

    const result = updateBodyTraitsSection(body, traitsSection);

    expect(result).toContain("- resolve: 0.95");
    expect(result).not.toContain("## Personality");
    expect(result).toContain("## Appearance");
  });

  it("preserves other sections when replacing **Traits:** in the middle of content", () => {
    const body =
      "# Aldric Thornwood\n\n" +
      "## Backstory\nAldric was born.\n\n" +
      "**Traits:**\n- old_trait: 0.3\n\n" +
      "## Recent Events\nHe led the siege.\n\n" +
      "## Relationships\nAllies with many.\n";

    const result = updateBodyTraitsSection(body, traitsSection);

    expect(result).toContain("- resolve: 0.95");
    expect(result).not.toContain("- old_trait: 0.3");
    expect(result).toContain("## Backstory");
    expect(result).toContain("## Recent Events");
    expect(result).toContain("## Relationships");
  });
});
