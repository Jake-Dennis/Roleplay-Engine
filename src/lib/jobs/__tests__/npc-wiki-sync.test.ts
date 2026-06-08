/**
 * Tests for npc-wiki-sync job handler.
 *
 * Covers handleNpcWikiSync (main handler), buildTraitsSection, and
 * updateBodyTraitsSection via the handler pipeline.
 *
 * Pattern reference: src/lib/__tests__/safe-json.test.ts
 * Mock strategy: bun mock.module with mutable let variables for per-test control.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";

// ===========================================================================
// Mutable mock state — reassign in beforeEach / individual tests to control
// what each mocked module returns.
// ===========================================================================

let mockGetDb: (...args: any[]) => any;
let mockGetWikiRoot: (...args: any[]) => string;
let mockReadWikiPage: (...args: any[]) => any;
let mockWriteWikiPage: (...args: any[]) => string;
let mockListWikiPages: (...args: any[]) => any[];
let mockIsLocked: (...args: any[]) => Promise<boolean>;

// ===========================================================================
// Module mocks — must appear BEFORE the import under test.
// Each factory captures a mutable let variable, so beforeEach reassignment
// takes effect for the next test.
// ===========================================================================

mock.module("@/lib/db", () => ({
  getDb: (...args: any[]) => mockGetDb(...args),
}));

mock.module("@/lib/logger", () => ({
  logger: {
    warn: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
  },
}));

mock.module("@/lib/wiki/wiki-root", () => ({
  getWikiRoot: (...args: any[]) => mockGetWikiRoot(...args),
}));

mock.module("@/lib/wiki/file-io", () => ({
  readWikiPage: (...args: any[]) => mockReadWikiPage(...args),
  writeWikiPage: (...args: any[]) => mockWriteWikiPage(...args),
  listWikiPages: (...args: any[]) => mockListWikiPages(...args),
}));

mock.module("@/lib/wiki/validation", () => ({
  isLocked: (...args: any[]) => mockIsLocked(...args),
}));

mock.module("@/lib/job-processor", () => ({
  updateJobProgress: mock(() => {}),
  markJobCompleted: mock(() => {}),
}));

// ===========================================================================
// Import under test (after mocks so module resolution is intercepted)
// ===========================================================================

import { handleNpcWikiSync } from "../npc-wiki-sync";

// ===========================================================================
// Test data factories
// ===========================================================================

const TEST_USER_ID = "user-abc123";
const TEST_NPC_ID = "npc-def456";
const TEST_JOB_ID = "job-xyz789";

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

function makeEntityPage(
  overrides: Partial<{
    path: string;
    content: string;
    frontmatter: Record<string, unknown>;
  }> = {}
) {
  return {
    path: "/mock/wiki/entities/aldric-thornwood.md",
    content: "Some existing wiki body content.",
    frontmatter: {
      title: "Aldric Thornwood",
      type: "entity",
      status: "reviewed",
    },
    ...overrides,
  };
}

function mockDbReturning(npc: unknown) {
  return () => ({
    prepare: mock(() => ({
      get: mock(() => npc),
    })),
  });
}

// ===========================================================================
// Setup — reset all mutable state before each test
// ===========================================================================

beforeEach(() => {
  // Default success path: NPC exists, wiki root valid, page found, not locked
  mockGetDb = mockDbReturning(makeNpc());
  mockGetWikiRoot = mock(() => "/mock/wiki/root");
  mockReadWikiPage = mock(() => makeEntityPage());
  mockWriteWikiPage = mock(() => "/mock/wiki/entities/aldric-thornwood.md");
  mockListWikiPages = mock(() => [makeEntityPage()]);
  mockIsLocked = mock(() => Promise.resolve(false));
});

// ===========================================================================
// Tests 1-6: handleNpcWikiSync — early-exit / skip scenarios
// ===========================================================================

describe("handleNpcWikiSync", () => {
  // -----------------------------------------------------------------------
  // Test 1: Missing params
  // -----------------------------------------------------------------------
  it("returns skipped result when userId or npcId is missing", async () => {
    const noUserId = await handleNpcWikiSync(TEST_JOB_ID, {
      npcId: TEST_NPC_ID,
    });
    expect(noUserId.success).toBe(true);
    expect(noUserId.data).toEqual({ skipped: true, reason: "missing_params" });

    const noNpcId = await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
    });
    expect(noNpcId.success).toBe(true);
    expect(noNpcId.data).toEqual({ skipped: true, reason: "missing_params" });
  });

  // -----------------------------------------------------------------------
  // Test 2: NPC not found in DB
  // -----------------------------------------------------------------------
  it("returns skipped result when NPC not found in DB", async () => {
    mockGetDb = mockDbReturning(undefined);

    const result = await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      skipped: true,
      reason: "npc_not_found",
      npcId: TEST_NPC_ID,
    });
  });

  // -----------------------------------------------------------------------
  // Test 3: Invalid wiki root
  // -----------------------------------------------------------------------
  it("returns skipped result when wiki root is invalid", async () => {
    mockGetWikiRoot = mock(() => {
      throw new Error("Invalid path");
    });

    const result = await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      skipped: true,
      reason: "invalid_wiki_root",
    });
  });

  // -----------------------------------------------------------------------
  // Test 4: No matching entity page
  // -----------------------------------------------------------------------
  it("returns skipped result when no matching entity page exists", async () => {
    mockListWikiPages = mock(() => [
      makeEntityPage({
        frontmatter: {
          title: "Other Character",
          type: "entity",
          status: "reviewed",
        },
      }),
      makeEntityPage({
        frontmatter: {
          title: "Aldric Thornwood",
          type: "concept", // wrong type — should not match
          status: "reviewed",
        },
      }),
    ]);

    const result = await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      skipped: true,
      reason: "no_entity_page",
      npcName: "Aldric Thornwood",
    });
  });

  // -----------------------------------------------------------------------
  // Test 5: Locked wiki page
  // -----------------------------------------------------------------------
  it("returns skipped result when wiki page is locked", async () => {
    mockIsLocked = mock(() => Promise.resolve(true));

    const result = await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      skipped: true,
      reason: "page_locked",
      npcName: "Aldric Thornwood",
    });
  });

  // -----------------------------------------------------------------------
  // Test 6: Successful sync — full happy path with traits + behavior
  // -----------------------------------------------------------------------
  it("successfully syncs NPC traits to wiki page body", async () => {
    const npc = makeNpc({
      personality_traits: JSON.stringify({
        bravery: 0.85,
        aggression: 0.42,
        loyalty: 0.91,
      }),
      behavior_patterns: JSON.stringify([
        "stands ground under pressure",
        "mentions fallen comrades",
      ]),
    });
    mockGetDb = mockDbReturning(npc);

    let capturedBody = "";
    let capturedFrontmatter: Record<string, unknown> | null = null;
    mockWriteWikiPage = mock(
      (_path: string, body: string, fm: Record<string, unknown>) => {
        capturedBody = body;
        capturedFrontmatter = fm;
        return _path;
      }
    );

    const result = await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      npcName: "Aldric Thornwood",
      pagePath: "/mock/wiki/entities/aldric-thornwood.md",
      traitsUpdated: true,
    });

    // Verify traits section was written to body
    expect(capturedBody).toContain("**Traits:**");
    expect(capturedBody).toContain("- bravery: 0.85");
    expect(capturedBody).toContain("- aggression: 0.42");
    expect(capturedBody).toContain("- loyalty: 0.91");

    // Verify behavior patterns section
    expect(capturedBody).toContain("**Behavior Patterns:**");
    expect(capturedBody).toContain("- stands ground under pressure");
    expect(capturedBody).toContain("- mentions fallen comrades");

    // Verify frontmatter is preserved
    expect(capturedFrontmatter).toEqual({
      title: "Aldric Thornwood",
      type: "entity",
      status: "reviewed",
    });
  });
});

// ===========================================================================
// Tests 7-8: buildTraitsSection (verified through handler pipeline)
// ===========================================================================

describe("buildTraitsSection (via handler)", () => {
  // -----------------------------------------------------------------------
  // Test 7: Parses JSON personality_traits correctly
  // -----------------------------------------------------------------------
  it("transforms JSON personality_traits into markdown list items", async () => {
    const npc = makeNpc({
      personality_traits: JSON.stringify({
        bravery: 0.85,
        aggression: 0.42,
        charisma: 0.73,
      }),
      behavior_patterns: null,
    });
    mockGetDb = mockDbReturning(npc);

    let capturedBody = "";
    mockWriteWikiPage = mock((_path: string, body: string) => {
      capturedBody = body;
      return _path;
    });

    await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(capturedBody).toContain("- bravery: 0.85");
    expect(capturedBody).toContain("- aggression: 0.42");
    expect(capturedBody).toContain("- charisma: 0.73");

    // Should NOT contain Behavior Patterns (it was null)
    expect(capturedBody).not.toContain("**Behavior Patterns:**");
  });

  // -----------------------------------------------------------------------
  // Test 8: Handles null personality_traits gracefully
  // -----------------------------------------------------------------------
  it("outputs fallback text when personality_traits is null", async () => {
    const npc = makeNpc({
      personality_traits: null,
      behavior_patterns: null,
    });
    mockGetDb = mockDbReturning(npc);

    let capturedBody = "";
    mockWriteWikiPage = mock((_path: string, body: string) => {
      capturedBody = body;
      return _path;
    });

    await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(capturedBody).toContain("- (no traits defined)");
  });

  // -----------------------------------------------------------------------
  // Edge case: invalid JSON in personality_traits is included as raw string
  // -----------------------------------------------------------------------
  it("includes raw personality_traits when JSON is invalid", async () => {
    const npc = makeNpc({
      personality_traits: "not-json-string",
      behavior_patterns: null,
    });
    mockGetDb = mockDbReturning(npc);

    let capturedBody = "";
    mockWriteWikiPage = mock((_path: string, body: string) => {
      capturedBody = body;
      return _path;
    });

    await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(capturedBody).toContain("- not-json-string");
  });

  // -----------------------------------------------------------------------
  // Edge case: includes Behavior Patterns when present
  // -----------------------------------------------------------------------
  it("includes behavior patterns section when behavior_patterns is set", async () => {
    const npc = makeNpc({
      personality_traits: JSON.stringify({ caution: 0.6 }),
      behavior_patterns: JSON.stringify([
        "avoids direct confrontation",
        "prefers ambushes",
      ]),
    });
    mockGetDb = mockDbReturning(npc);

    let capturedBody = "";
    mockWriteWikiPage = mock((_path: string, body: string) => {
      capturedBody = body;
      return _path;
    });

    await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    expect(capturedBody).toContain("**Behavior Patterns:**");
    expect(capturedBody).toContain("- avoids direct confrontation");
    expect(capturedBody).toContain("- prefers ambushes");
  });
});

// ===========================================================================
// Tests 9-11: updateBodyTraitsSection (verified through handler pipeline)
// ===========================================================================

describe("updateBodyTraitsSection (via handler)", () => {
  const npc = makeNpc({
    personality_traits: JSON.stringify({ resolve: 0.95 }),
    behavior_patterns: null,
  });

  // -----------------------------------------------------------------------
  // Test 9: Replaces existing **Traits:** inline section
  // -----------------------------------------------------------------------
  it("replaces existing **Traits:** section while preserving surrounding content", async () => {
    const bodyWithTraits =
      "## Backstory\nAldric was born in the northern reaches.\n\n" +
      "**Traits:**\n- old_trait: 0.3\n- obsolete: 0.1\n\n" +
      "## Recent Events\nHe led the siege.\n";

    mockGetDb = mockDbReturning(npc);
    mockReadWikiPage = mock(() =>
      makeEntityPage({ content: bodyWithTraits })
    );

    let capturedBody = "";
    mockWriteWikiPage = mock((_path: string, body: string) => {
      capturedBody = body;
      return _path;
    });

    await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    // New trait present, old trait gone
    expect(capturedBody).toContain("- resolve: 0.95");
    expect(capturedBody).not.toContain("- old_trait: 0.3");
    expect(capturedBody).not.toContain("- obsolete: 0.1");

    // Surrounding content preserved
    expect(capturedBody).toContain("## Backstory");
    expect(capturedBody).toContain("northern reaches");
    expect(capturedBody).toContain("## Recent Events");
    expect(capturedBody).toContain("He led the siege");
  });

  // -----------------------------------------------------------------------
  // Test 10: Replaces ## Personality section when **Traits:** absent
  // -----------------------------------------------------------------------
  it("replaces ## Personality section when no inline **Traits:** exists", async () => {
    const bodyWithPersonality =
      "## Appearance\nTall and broad-shouldered.\n\n" +
      "## Personality\nA brooding knight with a dark sense of humor.\n\n" +
      "## Background\nFrom the Thornwood lineage.\n";

    mockGetDb = mockDbReturning(npc);
    mockReadWikiPage = mock(() =>
      makeEntityPage({ content: bodyWithPersonality })
    );

    let capturedBody = "";
    mockWriteWikiPage = mock((_path: string, body: string) => {
      capturedBody = body;
      return _path;
    });

    await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    // New traits section replaces the ## Personality section
    expect(capturedBody).toContain("- resolve: 0.95");
    expect(capturedBody).not.toContain("## Personality");

    // Other sections preserved
    expect(capturedBody).toContain("## Appearance");
    expect(capturedBody).toContain("Tall and broad-shouldered");
    expect(capturedBody).toContain("## Background");
    expect(capturedBody).toContain("Thornwood lineage");
  });

  // -----------------------------------------------------------------------
  // Test 11: Appends ## NPC Evolution when neither section exists
  // -----------------------------------------------------------------------
  it("appends ## NPC Evolution section when no existing traits or personality section", async () => {
    const bodySimple =
      "## Background\nA brief background.\n\nSome additional notes.\n";

    mockGetDb = mockDbReturning(npc);
    mockReadWikiPage = mock(() =>
      makeEntityPage({ content: bodySimple })
    );

    let capturedBody = "";
    mockWriteWikiPage = mock((_path: string, body: string) => {
      capturedBody = body;
      return _path;
    });

    await handleNpcWikiSync(TEST_JOB_ID, {
      userId: TEST_USER_ID,
      npcId: TEST_NPC_ID,
    });

    // Original content preserved
    expect(capturedBody).toContain("## Background");
    expect(capturedBody).toContain("A brief background");

    // New ## NPC Evolution section appended
    expect(capturedBody).toContain("## NPC Evolution");
    expect(capturedBody).toContain("- resolve: 0.95");

    // The appended section comes after the original content
    const bgIdx = capturedBody.indexOf("## Background");
    const evoIdx = capturedBody.indexOf("## NPC Evolution");
    expect(evoIdx).toBeGreaterThan(bgIdx);
  });
});
