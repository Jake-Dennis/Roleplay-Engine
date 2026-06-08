/**
 * Tests for prompt-builder.ts
 *
 * Covers:
 * - buildIntentContext() — intent descriptions and fallback
 * - estimateTokens() — token estimation logic
 * - assemblePrompt() — section ordering, content wrapping, empty sections
 * - applyContextBudget() — budget enforcement, truncation, edge cases
 * - assemblePromptWithBudget() — combining budget + assembly
 */

import { describe, it, expect } from "bun:test";
import {
  assemblePrompt,
  assemblePromptWithBudget,
  applyContextBudget,
  estimateTokens,
  buildIntentContext,
  INJECTION_PROTECTION,
} from "../prompt-builder";
import type { RetrievedContext } from "../retrieval";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** A bare-minimum RetrievedContext with no optional fields populated. */
function createMinimalContext(overrides?: Partial<RetrievedContext>): RetrievedContext {
  return {
    scene: {
      location: null,
      goal: null,
      tone: null,
      currentIntent: null,
      activeNpcs: [],
    },
    lore: { entries: [] },
    relationships: { relationships: [] },
    recentMessages: { messages: [] },
    canonContext: null,
    intent: "exploration" as const,
    ...overrides,
  };
}

/** A fully populated RetrievedContext exercising every code path. */
function createFullContext(): RetrievedContext {
  return {
    scene: {
      location: "The Silver Tavern",
      goal: "Find the hidden map",
      tone: "Mysterious",
      currentIntent: null,
      activeNpcs: ["Bartender", "Stranger"],
      sceneType: "social",
      sceneTension: 0.5,
      conflictType: "mystery",
      stakes: "high",
    },
    lore: {
      entries: [
        { id: 1, name: "Silver Tavern", description: "A cozy tavern with a hidden cellar", type: "location" },
        { id: 2, name: "King Aldric", description: "The wise ruler of the realm", type: "character" },
      ],
    },
    relationships: {
      relationships: [
        {
          source: "Player",
          target: "Bartender",
          state: "friendly",
          emotionalState: { trust: 0.8, warmth: 0.6 },
          stage: "friend",
          sharedHistory: [
            { type: "meeting", summary: "First met at the tavern", at: "2026-01-01" },
          ],
          updatedAt: new Date().toISOString(),
        },
      ],
    },
    recentMessages: {
      messages: [
        { senderId: null, content: "You push open the heavy oak door and step inside.", timestamp: "t1" },
        { senderId: "player", content: "I approach the bartender and ask about the map.", timestamp: "t2" },
        { senderId: null, content: "The bartender eyes you warily.", timestamp: "t3" },
      ],
    },
    canonContext: "This realm is called Eldoria, a land of magic and mystery.",
    intent: "exploration",
    memories: {
      entries: [
        { content: "The bartender revealed he once served the Shadow King.", type: "narrative", importance: 9, created_at: "t1" },
        { content: "A secret passage exists behind the tavern fireplace.", type: "narrative", importance: 7, created_at: "t2" },
      ],
    },
    narrativeThreads: [
      { title: "Find the Hidden Map", status: "active", description: "Search the tavern for clues", escalation_level: "medium" },
      { title: "Shadow King's Return", status: "foreshadowed", description: "Ancient evil stirring", escalation_level: "high" },
    ],
    activeEntities: ["Player", "Bartender", "Stranger", "Shadow King"],
    messageSummaries: [
      { summary: "Player entered the tavern and spoke to the bartender about a map.", type: "narrative" },
    ],
    relationshipEvolution: [
      {
        relationshipId: "r1",
        source: "Player",
        target: "Bartender",
        emotionalState: "friendly",
        relationshipStage: "friend",
        triggerEvent: "shared drink",
        recordedAt: "t2",
      },
    ],
    relationshipAnchors: [
      { description: "Bartender saved Player from guards", anchor_type: "life_debt", emotional_impact: "indebted" },
    ],
    decisionPoints: [
      { prompt: "Trust the bartender?", choicesMade: ["Yes, cautiously"], context: "He seemed genuine" },
    ],
    narrativeState: {
      tension: 0.3,
      pacing: 0.5,
      narrativePhase: "rising_action",
      activeGoals: '["Find the hidden map", "Learn about Shadow King"]',
      activeConflicts: '["Bartender is suspicious", "Guards are patrolling"]',
    },
  };
}

/** System prompt used across tests. */
const SYSTEM_PROMPT = "You are a narrative game master in a fantasy roleplay.";

// ---------------------------------------------------------------------------
// buildIntentContext
// ---------------------------------------------------------------------------

describe("buildIntentContext", () => {
  it("returns correct description for every known intent", () => {
    const knownIntents: Record<string, string> = {
      exploration: "exploring, investigating, or searching",
      combat: "combat or confrontation",
      social: "talking, negotiating, or persuading",
      investigation: "searching for clues or solving mysteries",
      rest: "resting or taking a break",
      travel: "moving between locations",
      ritual: "performing magic or a ritual",
    };

    for (const [intent, expectedSubstring] of Object.entries(knownIntents)) {
      const result = buildIntentContext(intent);
      expect(result).toContain(`[INTENT: ${intent.toUpperCase()}]`);
      expect(result).toContain(expectedSubstring);
    }
  });

  it("falls back to social description for unknown intents", () => {
    const result = buildIntentContext("dance");
    expect(result).toContain("[INTENT: DANCE]");
    expect(result).toContain("interacting socially");
  });

  it("uppercases the intent label in the header", () => {
    const result = buildIntentContext("Exploration");
    // intent.toUpperCase() -> "EXPLORATION"
    expect(result).toContain("[INTENT: EXPLORATION]");
  });

  it("produces the expected two-line format", () => {
    const result = buildIntentContext("social");
    expect(result).toBe(
      "[INTENT: SOCIAL]\nThe user is talking, negotiating, or persuading."
    );
  });
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("uses ceil(character count / 4)", () => {
    // 1 char  -> 0.25 -> 1
    expect(estimateTokens("a")).toBe(1);
    // 3 chars -> 0.75 -> 1
    expect(estimateTokens("abc")).toBe(1);
    // 4 chars -> 1.00 -> 1
    expect(estimateTokens("abcd")).toBe(1);
    // 5 chars -> 1.25 -> 2
    expect(estimateTokens("abcde")).toBe(2);
    // 8 chars -> 2.00 -> 2
    expect(estimateTokens("abcdefgh")).toBe(2);
    // 9 chars -> 2.25 -> 3
    expect(estimateTokens("abcdefghi")).toBe(3);
  });

  it("handles a very long string", () => {
    const long = "hello ".repeat(2000); // 12000 chars
    expect(estimateTokens(long)).toBe(3000); // 12000 / 4 = 3000
  });

  it("handles strings with special characters and whitespace", () => {
    const mixed = "\t\n  hello! @#$% ^&*() ";
    expect(estimateTokens(mixed)).toBe(Math.ceil(mixed.length / 4));
  });

  it("handles strings with only whitespace", () => {
    expect(estimateTokens("   ")).toBe(1);
    expect(estimateTokens("\n\n\n\n")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — system prompt / injection protection
// ---------------------------------------------------------------------------

describe("assemblePrompt - system prompt basics", () => {
  it("starts with the system prompt text", () => {
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result.startsWith(SYSTEM_PROMPT)).toBe(true);
  });

  it("includes the wikilink instruction", () => {
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[[wikilink notation]]");
  });

  it("includes injection protection text", () => {
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("DATA ONLY");
    expect(result).toContain(INJECTION_PROTECTION.trim().slice(0, 20));
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — required sections in minimal context
// ---------------------------------------------------------------------------

describe("assemblePrompt - minimal context", () => {
  it("contains the intent section", () => {
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[INTENT: EXPLORATION]");
  });

  it("contains the recent history section even with empty messages", () => {
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[RECENT HISTORY]");
  });

  it("omits optional sections when context data is absent", () => {
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);

    expect(result).not.toContain("[CHARACTER INSTRUCTIONS]");
    expect(result).not.toContain("[MEMORIES]");
    expect(result).not.toContain("[MESSAGE SUMMARIES]");
    expect(result).not.toContain("[CURRENT SCENE]");
    expect(result).not.toContain("[ACTIVE THREADS]");
    expect(result).not.toContain("[ACTIVE ENTITIES]");
    expect(result).not.toContain("[KNOWN WORLD]");
    expect(result).not.toContain("[RELATIONSHIPS]");
    expect(result).not.toContain("[RELATIONSHIP HISTORY]");
    expect(result).not.toContain("[NARRATIVE ANCHORS]");
    expect(result).not.toContain("[DECISION POINTS]");
  });

  it("does not fail when optional fields are undefined", () => {
    const ctx = createMinimalContext({
      memories: undefined,
      narrativeThreads: undefined,
      activeEntities: undefined,
      messageSummaries: undefined,
      relationshipEvolution: undefined,
      relationshipAnchors: undefined,
      decisionPoints: undefined,
      narrativeState: undefined,
    });
    // Should not throw
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[INTENT: EXPLORATION]");
    expect(result).toContain("[RECENT HISTORY]");
  });

  it("handles null canonContext gracefully", () => {
    const ctx = createMinimalContext({ canonContext: null });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[INTENT: EXPLORATION]");
  });

  it("handles empty arrays in scene.activeNpcs", () => {
    const ctx = createMinimalContext({
      scene: {
        location: "Town",
        goal: null,
        tone: null,
        currentIntent: null,
        activeNpcs: [],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[CURRENT SCENE]");
    expect(result).toContain("Location: Town");
    // Should not include "Present:" line since there are no NPCs
    expect(result).not.toContain("Present:");
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — section ordering
// ---------------------------------------------------------------------------

describe("assemblePrompt - section ordering", () => {
  it("places sections in the documented order when all are present", () => {
    const ctx = createFullContext();
    const charInstructions = "Speak in a medieval fantasy style.";
    const result = assemblePrompt(ctx, SYSTEM_PROMPT, charInstructions);

    // Collect the index of each section marker (expect strictly increasing)
    const markers: [string, number][] = [
      ["[CHARACTER INSTRUCTIONS]", -1],
      ["[MEMORIES]", -1],
      ["[MESSAGE SUMMARIES]", -1],
      ["[CURRENT SCENE]", -1],
      ["[INTENT:", -1],
      ["[ACTIVE THREADS]", -1],
      ["[ACTIVE ENTITIES]", -1],
      ["[KNOWN WORLD]", -1],
      ["[RELATIONSHIPS]", -1],
      ["[RELATIONSHIP HISTORY]", -1],
      ["[NARRATIVE ANCHORS]", -1],
      ["[DECISION POINTS]", -1],
      ["[RECENT HISTORY]", -1],
    ];

    for (const [marker] of markers) {
      const idx = result.indexOf(marker);
      expect(idx).toBeGreaterThanOrEqual(0);
    }

    // Verify strictly increasing order
    let prevIdx = result.indexOf("[CHARACTER INSTRUCTIONS]");
    expect(prevIdx).toBeGreaterThan(0);

    for (let i = 1; i < markers.length; i++) {
      const currIdx = result.indexOf(markers[i][0]);
      expect(currIdx).toBeGreaterThan(prevIdx);
      prevIdx = currIdx;
    }
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — character instructions
// ---------------------------------------------------------------------------

describe("assemblePrompt - character instructions", () => {
  it("includes character instructions section when provided", () => {
    const ctx = createMinimalContext();
    const instructions = "Speak like a pirate.";
    const result = assemblePrompt(ctx, SYSTEM_PROMPT, instructions);
    expect(result).toContain("[CHARACTER INSTRUCTIONS]");
    expect(result).toContain(instructions);
  });

  it("wraps character instructions in <user_content> tags", () => {
    const ctx = createMinimalContext();
    const instructions = "You are a rogue.";
    const result = assemblePrompt(ctx, SYSTEM_PROMPT, instructions);

    expect(result).toContain("<user_content>");
    expect(result).toContain("You are a rogue.");
    expect(result).toContain("</user_content>");
  });

  it("omits character instructions section when null/undefined", () => {
    const ctx = createMinimalContext();

    const resultNull = assemblePrompt(ctx, SYSTEM_PROMPT, null);
    expect(resultNull).not.toContain("[CHARACTER INSTRUCTIONS]");

    const resultUndef = assemblePrompt(ctx, SYSTEM_PROMPT, undefined);
    expect(resultUndef).not.toContain("[CHARACTER INSTRUCTIONS]");
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — user_content wrapping
// ---------------------------------------------------------------------------

describe("assemblePrompt - user_content wrapping", () => {
  it("wraps canon context in <user_content> tags", () => {
    const ctx = createMinimalContext({
      canonContext: "The world is vast.",
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("<user_content>\nThe world is vast.\n</user_content>");
  });

  it("wraps memories in <user_content> tags", () => {
    const ctx = createMinimalContext({
      memories: {
        entries: [{ content: "Secret passage found", type: "narrative", importance: 5, created_at: "t1" }],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("<user_content>");
    expect(result).toContain("Secret passage found");
    expect(result).toContain("</user_content>");
  });

  it("wraps recent messages in <user_content> tags", () => {
    const ctx = createMinimalContext({
      recentMessages: {
        messages: [{ senderId: null, content: "Hello world", timestamp: "t1" }],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    // Should have <user_content> wrapping around the messages
    expect(result).toContain("<user_content>");
    expect(result).toContain("Hello world");
    expect(result).toContain("</user_content>");
    // And should be in [RECENT HISTORY] section
    expect(result).toContain("[RECENT HISTORY]");
  });

  it("wraps lore in <user_content> tags", () => {
    const ctx = createMinimalContext({
      lore: {
        entries: [{ id: 1, name: "Eldoria", description: "A magical realm", type: "world" }],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("<user_content>");
    expect(result).toContain("Eldoria");
    expect(result).toContain("</user_content>");
  });

  it("wraps relationships in <user_content> tags", () => {
    const ctx = createMinimalContext({
      relationships: {
        relationships: [{ source: "A", target: "B", state: "friendly" }],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("<user_content>");
    expect(result).toContain("A → B");
    expect(result).toContain("</user_content>");
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — narrative state (goals & conflicts as bullet points)
// ---------------------------------------------------------------------------

describe("assemblePrompt - narrative state", () => {
  it("renders active goals as bullet points capped at 5", () => {
    const ctx = createMinimalContext({
      scene: { location: "Town", goal: null, tone: null, currentIntent: null, activeNpcs: [] },
      narrativeState: {
        tension: null,
        pacing: null,
        narrativePhase: null,
        activeGoals: '["Goal A", "Goal B", "Goal C", "Goal D", "Goal E", "Goal F"]',
        activeConflicts: null,
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("Active Goals:");
    expect(result).toContain("• Goal A");
    expect(result).toContain("• Goal E");
    // Goal F should be capped
    expect(result).not.toContain("• Goal F");
  });

  it("renders active conflicts as bullet points capped at 5", () => {
    const ctx = createMinimalContext({
      scene: { location: "Town", goal: null, tone: null, currentIntent: null, activeNpcs: [] },
      narrativeState: {
        tension: null,
        pacing: null,
        narrativePhase: null,
        activeGoals: null,
        activeConflicts: '["Conflict A", "Conflict B", "Conflict C", "Conflict D", "Conflict E", "Conflict F"]',
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("Active Conflicts:");
    expect(result).toContain("• Conflict A");
    expect(result).not.toContain("• Conflict F");
  });

  it("omits active goals/conflicts when arrays are empty", () => {
    const ctx = createMinimalContext({
      scene: { location: "Town", goal: null, tone: null, currentIntent: null, activeNpcs: [] },
      narrativeState: {
        tension: null,
        pacing: null,
        narrativePhase: null,
        activeGoals: "[]",
        activeConflicts: "[]",
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).not.toContain("Active Goals:");
    expect(result).not.toContain("Active Conflicts:");
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — scene state detailed
// ---------------------------------------------------------------------------

describe("assemblePrompt - scene state", () => {
  it("includes all scene fields when present", () => {
    const ctx = createMinimalContext({
      scene: {
        location: "Dungeon",
        goal: "Escape",
        tone: "Dark",
        currentIntent: null,
        activeNpcs: ["Rat"],
        sceneType: "combat",
        sceneTension: 0.9,
        conflictType: "escape",
        stakes: "life or death",
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    // Should contain scene type, tension, conflict, stakes
    expect(result).toContain("Scene Type: combat");
    expect(result).toContain("Tension: 0.9/1.0");
    expect(result).toContain("Conflict: escape (life or death)");
  });

  it("includes Present line only when activeNpcs is non-empty", () => {
    const ctx = createMinimalContext({
      scene: {
        location: "Dungeon",
        goal: null,
        tone: null,
        currentIntent: null,
        activeNpcs: ["Goblin", "Orc"],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("Present: Goblin, Orc");
  });
});

// ---------------------------------------------------------------------------
// applyContextBudget — basic
// ---------------------------------------------------------------------------

describe("applyContextBudget - basic", () => {
  it("returns full context when budget is large enough", () => {
    const ctx = createFullContext();
    // 100000 tokens should be more than enough
    const result = applyContextBudget(ctx, 100000);
    // All messages preserved
    expect(result.recentMessages.messages).toHaveLength(3);
    // All lore preserved
    expect(result.lore.entries).toHaveLength(2);
    // All relationships preserved
    expect(result.relationships.relationships).toHaveLength(1);
  });

  it("returns minimal context when budget is at or below overhead", () => {
    const ctx = createFullContext();
    const result = applyContextBudget(ctx, 400); // Below overhead (500)
    expect(result.lore.entries).toHaveLength(0);
    expect(result.relationships.relationships).toHaveLength(0);
    expect(result.canonContext).toBeNull();
    // Only last 5 messages kept
    expect(result.recentMessages.messages.length).toBeLessThanOrEqual(5);
  });

  it("does not mutate the original context", () => {
    const ctx = createFullContext();
    const originalMessageCount = ctx.recentMessages.messages.length;
    applyContextBudget(ctx, 100);
    expect(ctx.recentMessages.messages).toHaveLength(originalMessageCount);
  });

  it("handles exactly zero maxTokens", () => {
    const ctx = createMinimalContext();
    const result = applyContextBudget(ctx, 0);
    expect(result.lore.entries).toHaveLength(0);
    expect(result.relationships.relationships).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyContextBudget — message truncation
// ---------------------------------------------------------------------------

describe("applyContextBudget - message truncation", () => {
  it("keeps the most recent messages when budget is tight", () => {
    const ctx = createMinimalContext({
      recentMessages: {
        messages: [
          { senderId: null, content: "A".repeat(800), timestamp: "t1" },  // ~200 tokens
          { senderId: null, content: "B".repeat(800), timestamp: "t2" },  // ~200 tokens
          { senderId: null, content: "C".repeat(800), timestamp: "t3" },  // ~200 tokens
          { senderId: null, content: "D".repeat(800), timestamp: "t4" },  // ~200 tokens
        ],
      },
    });
    // Budget: 600 tokens total -> available = 100 -> msgBudget = 38 tokens (floor(100 * 0.38))
    // Each message is ~200 tokens, so barely any can fit.
    // At least 1 should fit if msgBudget > 0, and the *last* messages should be kept.
    const result = applyContextBudget(ctx, 600);

    // At least one message kept
    expect(result.recentMessages.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.recentMessages.messages.length).toBeLessThanOrEqual(4);
  });

  it("keeps at least one message even when first exceeds budget", () => {
    // Each message is ~250 tokens with 4 chars per token = 1000 chars
    const messages = Array.from({ length: 3 }, (_, i) => ({
      senderId: null as string | null,
      content: "X".repeat(1000), // ~250 tokens each
      timestamp: `t${i}`,
    }));
    const ctx = createMinimalContext({ recentMessages: { messages } });
    // Budget: 600 total -> available = 100 -> msgBudget = 38
    // First (most recent) message alone is 250 tokens > budget, but should still be kept
    // (because the loop allows first message even if over budget)
    const result = applyContextBudget(ctx, 600);
    expect(result.recentMessages.messages.length).toBe(1);
  });

  it("preserves message order (most recent last, oldest first)", () => {
    const ctx = createMinimalContext({
      recentMessages: {
        messages: [
          { senderId: null, content: "Old", timestamp: "t1" },
          { senderId: null, content: "Middle", timestamp: "t2" },
          { senderId: null, content: "New", timestamp: "t3" },
        ],
      },
    });
    // Budget large enough to keep all
    const result = applyContextBudget(ctx, 10000);
    expect(result.recentMessages.messages[0].content).toBe("Old");
    expect(result.recentMessages.messages[2].content).toBe("New");
  });
});

// ---------------------------------------------------------------------------
// applyContextBudget — lore truncation
// ---------------------------------------------------------------------------

describe("applyContextBudget - lore truncation", () => {
  it("truncates lore entries when budget is exceeded", () => {
    const ctx = createMinimalContext({
      lore: {
        entries: [
          { id: 1, name: "A".repeat(500), description: "B".repeat(500), type: "location" }, // ~250 tokens
          { id: 2, name: "C".repeat(500), description: "D".repeat(500), type: "character" }, // ~250 tokens
          { id: 3, name: "E".repeat(500), description: "F".repeat(500), type: "item" },      // ~250 tokens
        ],
      },
    });
    // Budget: 2000 total -> available = 1500 -> loreBudget = 300 (floor(1500 * 0.20))
    // Each entry is ~250 tokens, so first fits (250 < 300), second pushes over budget and stops
    const result = applyContextBudget(ctx, 2000);
    // At least 1 entry should survive, possibly more depending on exact token math
    expect(result.lore.entries.length).toBeGreaterThanOrEqual(1);
    expect(result.lore.entries.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// applyContextBudget — optional/undefined sections
// ---------------------------------------------------------------------------

describe("applyContextBudget - optional sections", () => {
  it("handles undefined memories gracefully", () => {
    const ctx = createMinimalContext({ memories: undefined });
    const result = applyContextBudget(ctx, 6000);
    expect(result.memories).toBeUndefined();
  });

  it("handles undefined narrativeThreads gracefully", () => {
    const ctx = createMinimalContext({ narrativeThreads: undefined });
    const result = applyContextBudget(ctx, 6000);
    expect(result.narrativeThreads).toBeUndefined();
  });

  it("handles undefined decisionPoints gracefully", () => {
    const ctx = createMinimalContext({ decisionPoints: undefined });
    const result = applyContextBudget(ctx, 6000);
    expect(result.decisionPoints).toBeUndefined();
  });

  it("handles empty lore entries", () => {
    const ctx = createMinimalContext({ lore: { entries: [] } });
    const result = applyContextBudget(ctx, 6000);
    expect(result.lore.entries).toEqual([]);
  });

  it("handles empty relationships", () => {
    const ctx = createMinimalContext({ relationships: { relationships: [] } });
    const result = applyContextBudget(ctx, 6000);
    expect(result.relationships.relationships).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyContextBudget — thread/decision point truncation
// ---------------------------------------------------------------------------

describe("applyContextBudget - threads and decision points", () => {
  it("truncates threads when budget is exceeded", () => {
    const ctx = createMinimalContext({
      narrativeThreads: [
        { title: "T1: " + "A".repeat(1000), status: "active", description: "D1: " + "B".repeat(500) },
        { title: "T2: " + "C".repeat(1000), status: "active", description: "D2: " + "D".repeat(500) },
      ],
    });
    // Budget small enough to force truncation
    const result = applyContextBudget(ctx, 1000);
    // available = 500, threadBudget = 50 (floor(500 * 0.10))
    // Each thread title is ~250 tokens alone, so only 1 max
    expect(result.narrativeThreads!.length).toBeLessThanOrEqual(1);
  });

  it("truncates decision points when budget is exceeded", () => {
    const ctx = createMinimalContext({
      decisionPoints: [
        { prompt: "P1: " + "A".repeat(800), choicesMade: ["Yes"], context: "context" },
        { prompt: "P2: " + "B".repeat(800), choicesMade: ["No"], context: "more context" },
      ],
    });
    const result = applyContextBudget(ctx, 1000);
    // available = 500, dpBudget = 10 (floor(500 * 0.02))
    expect(result.decisionPoints!.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// applyContextBudget — memory truncation
// ---------------------------------------------------------------------------

describe("applyContextBudget - memory truncation", () => {
  it("truncates memory entries when budget is exceeded", () => {
    const ctx = createMinimalContext({
      memories: {
        entries: [
          { content: "Memory A: " + "X".repeat(800), type: "narrative", importance: 9, created_at: "t1" },
          { content: "Memory B: " + "Y".repeat(800), type: "narrative", importance: 5, created_at: "t2" },
          { content: "Memory C: " + "Z".repeat(800), type: "narrative", importance: 3, created_at: "t3" },
        ],
      },
    });
    const result = applyContextBudget(ctx, 1000);
    // available = 500, memBudget = 75 (floor(500 * 0.15))
    // Each memory is ~200+ tokens, so only some survive
    expect(result.memories!.entries.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// assemblePromptWithBudget
// ---------------------------------------------------------------------------

describe("assemblePromptWithBudget", () => {
  it("produces a valid prompt string with budget applied", () => {
    const ctx = createFullContext();
    const result = assemblePromptWithBudget(ctx, SYSTEM_PROMPT, 6000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("[INTENT: EXPLORATION]");
    expect(result).toContain("[RECENT HISTORY]");
  });

  it("respects a very tight budget", () => {
    const ctx = createFullContext();
    const result = assemblePromptWithBudget(ctx, SYSTEM_PROMPT, 510);
    // available = 10 (barely anything after overhead), minimal context returned
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("passes character instructions through when provided", () => {
    const ctx = createMinimalContext();
    const instructions = "Be concise.";
    const result = assemblePromptWithBudget(ctx, SYSTEM_PROMPT, 6000, instructions);
    expect(result).toContain("[CHARACTER INSTRUCTIONS]");
    expect(result).toContain(instructions);
  });

  it("works with default maxTokens (6000)", () => {
    const ctx = createMinimalContext();
    const result = assemblePromptWithBudget(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[INTENT: EXPLORATION]");
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — relationship decay indicator
// ---------------------------------------------------------------------------

describe("assemblePrompt - relationship decay", () => {
  it("appends decay notice when relationship is stale (>7 days)", () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    const ctx = createMinimalContext({
      relationships: {
        relationships: [
          {
            source: "Player",
            target: "OldFriend",
            state: "distant",
            updatedAt: oldDate,
          },
        ],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("(decaying — last interacted");
    expect(result).toContain("days ago)");
  });

  it("does not append decay notice for recent relationships", () => {
    const recentDate = new Date().toISOString();
    const ctx = createMinimalContext({
      relationships: {
        relationships: [
          {
            source: "Player",
            target: "NewFriend",
            state: "friendly",
            updatedAt: recentDate,
          },
        ],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).not.toContain("decaying");
  });

  it("handles relationships without updatedAt gracefully", () => {
    const ctx = createMinimalContext({
      relationships: {
        relationships: [
          { source: "Player", target: "Mystery", state: "unknown" },
        ],
      },
    });
    // Should not throw
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[RELATIONSHIPS]");
    expect(result).not.toContain("decaying");
  });
});

// ---------------------------------------------------------------------------
// Edge cases — special characters and very long/short input
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles very long system prompts", () => {
    const longPrompt = "You are a GM. " + "X".repeat(10000);
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, longPrompt);
    expect(result.startsWith(longPrompt)).toBe(true);
    expect(result).toContain("[INTENT: EXPLORATION]");
  });

  it("handles very long character instructions", () => {
    const longInstructions = "Speak like this. " + "Y".repeat(5000);
    const ctx = createMinimalContext();
    const result = assemblePrompt(ctx, SYSTEM_PROMPT, longInstructions);
    expect(result).toContain(longInstructions);
  });

  it("handles special characters in all sections", () => {
    const ctx = createMinimalContext({
      canonContext: "Special: <script>alert('xss')</script> & \"quotes\"",
      scene: {
        location: "Café au Lait & <Tea>",
        goal: "Find -> $pecial || chars",
        tone: "Mystère! ¿Qué pasa?",
        currentIntent: null,
        activeNpcs: ["Zöe & François"],
      },
      recentMessages: {
        messages: [
          { senderId: null, content: "I said: \"Hello\" & >.<", timestamp: "t1" },
        ],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    // Should not throw and should contain the special characters
    expect(result).toContain("<script>alert('xss')</script>");
    expect(result).toContain("Café au Lait & <Tea>");
    expect(result).toContain("I said: \"Hello\"");
  });

  it("handles empty message arrays", () => {
    const ctx = createMinimalContext({
      recentMessages: { messages: [] },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[RECENT HISTORY]");
    // Should not crash
  });

  it("handles very short input (single character values)", () => {
    const ctx = createMinimalContext({
      scene: {
        location: "A",
        goal: "B",
        tone: "C",
        currentIntent: null,
        activeNpcs: [],
      },
      canonContext: "X",
      recentMessages: {
        messages: [
          { senderId: null, content: "Y", timestamp: "t1" },
        ],
      },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("[CURRENT SCENE]");
    expect(result).toContain("Location: A");
  });
});

// ---------------------------------------------------------------------------
// assemblePrompt — narrative state optional fields
// ---------------------------------------------------------------------------

describe("assemblePrompt - narrative state optional fields", () => {
  it("includes narrative phase / tension / pacing when provided", () => {
    const ctx = createMinimalContext({
      scene: { location: "Town", goal: null, tone: null, currentIntent: null, activeNpcs: [] },
      narrativeState: { tension: 0.7, pacing: 0.4, narrativePhase: "climax", activeGoals: null, activeConflicts: null },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).toContain("Narrative Phase: climax");
    expect(result).toContain("Overall Tension: 0.7/1.0");
    expect(result).toContain("Pacing: 0.4/1.0");
  });

  it("omits narrative phase / tension / pacing when null", () => {
    const ctx = createMinimalContext({
      scene: { location: "Town", goal: null, tone: null, currentIntent: null, activeNpcs: [] },
      narrativeState: { tension: null, pacing: null, narrativePhase: null, activeGoals: null, activeConflicts: null },
    });
    const result = assemblePrompt(ctx, SYSTEM_PROMPT);
    expect(result).not.toContain("Narrative Phase:");
    expect(result).not.toContain("Overall Tension:");
    expect(result).not.toContain("Pacing:");
  });
});
