export type Intent =
  | "exploration"
  | "combat"
  | "social"
  | "investigation"
  | "rest"
  | "travel"
  | "ritual";

/** Keywords mapped to intents for fast classification */
const INTENT_KEYWORDS: Record<Intent, RegExp[]> = {
  exploration: [/explore/i, /look around/i, /search/i, /investigate/i, /examine/i, /inspect/i, /check/i, /observe/i, /survey/i, /scan/i],
  combat: [/attack/i, /fight/i, /strike/i, /defend/i, /battle/i, /draw weapon/i, /shoot/i, /slash/i, /punch/i, /kill/i, /destroy/i],
  social: [/talk to/i, /ask/i, /convince/i, /persuade/i, /greet/i, /negotiate/i, /speak/i, /tell/i, /question/i, /chat/i, /discuss/i],
  investigation: [/find clues/i, /who did this/i, /what happened/i, /search for evidence/i, /clue/i, /mystery/i, /puzzle/i, /discover/i, /uncover/i, /reveal/i],
  rest: [/rest/i, /sleep/i, /camp/i, /wait/i, /take a break/i, /relax/i, /pause/i, /stop/i, /sit/i, /lie down/i],
  travel: [/go to/i, /head toward/i, /journey/i, /travel to/i, /move to/i, /walk to/i, /run to/i, /enter/i, /leave/i, /follow/i, /proceed/i],
  ritual: [/cast spell/i, /perform ritual/i, /pray/i, /use magic/i, /channel/i, /enchant/i, /summon/i, /curse/i, /bless/i, /conjure/i],
};

/** Intent prototype descriptions for semantic fallback */
export const INTENT_PROTOTYPES: Record<Intent, string> = {
  exploration: "explore the area, look around, search, investigate the ruins",
  combat: "attack, fight, defend, strike, battle, draw weapon",
  social: "talk to, ask, convince, persuade, greet, negotiate",
  investigation: "find clues, who did this, what happened, search for evidence",
  rest: "rest, sleep, camp, wait, take a break",
  travel: "go to, head toward, journey, travel to, move to",
  ritual: "cast spell, perform ritual, pray, use magic, channel",
};

/**
 * Classify user input into an intent category.
 * Uses keyword matching (fast path) first, falls back to default.
 */
export function classifyIntent(input: string): Intent {
  if (!input || input.trim().length === 0) return "social";

  // Score each intent by keyword matches
  const scores: Record<Intent, number> = {
    exploration: 0,
    combat: 0,
    social: 0,
    investigation: 0,
    rest: 0,
    travel: 0,
    ritual: 0,
  };

  for (const [intent, patterns] of Object.entries(INTENT_KEYWORDS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        scores[intent as Intent] += 1;
      }
    }
  }

  // Find intent with highest score
  let bestIntent: Intent = "social";
  let bestScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as Intent;
    }
  }

  return bestIntent;
}

/**
 * Build intent context block for the prompt
 */
export function buildIntentContext(intent: Intent): string {
  const descriptions: Record<Intent, string> = {
    exploration: "The player is exploring their surroundings, looking for points of interest.",
    combat: "The player is in combat or preparing for a confrontation.",
    social: "The player is engaging in conversation or social interaction.",
    investigation: "The player is searching for clues or trying to solve a mystery.",
    rest: "The player is resting, camping, or taking downtime.",
    travel: "The player is traveling or moving to a new location.",
    ritual: "The player is performing magic, a ritual, or a special ceremony.",
  };

  return `[INTENT]
The player's intent appears to be: ${intent.toUpperCase()}
${descriptions[intent]}
Focus the narrative response to match this intent.
`;
}
