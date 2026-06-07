import { BenchmarkConfig, RoleplayTestResult, RoleplayFactResult } from "./types";
import { generateText } from "../ollama";
import { logger } from "../logger";

// ============================================================================
// Lore Packs
// ============================================================================

interface LoreCharacter {
  name: string;
  role: string;
  traits: string[];
  relationships: string[];
}

interface LoreLocation {
  name: string;
  description: string;
}

interface LoreRule {
  rule: string;
  keywords: string[];
}

interface LorePack {
  name: string;
  setting: string;
  characters: LoreCharacter[];
  locations: LoreLocation[];
  rules: LoreRule[];
}

/** A compact but rich lore pack for testing roleplay memory and accuracy. */
const DEFAULT_LORE_PACK: LorePack = {
  name: "The Emberwild Frontier",
  setting: "A lawless desert planet on the edge of settled space, where ancient ruins hold forbidden technology.",
  characters: [
    {
      name: "Mara Kessler",
      role: "ex-Imperial archaeologist turned relic runner",
      traits: ["cybernetic left eye", "speaks fluent Old Imperial", "distrusts the Empire"],
      relationships: ["owes a debt to Governor Thorne"],
    },
    {
      name: "Governor Voss Thorne",
      role: "colonial governor of Emberwild Station",
      traits: ["ruthless pragmatist", "collects xeno-artifacts", "has a hidden lab"],
      relationships: ["holds Mara's debt", "answers to the Imperial Council"],
    },
    {
      name: "Kael-7",
      role: "ancient guardian construct (repurposed)",
      traits: ["holographic interface", "speaks in riddles", "memory banks are corrupted"],
      relationships: ["guardian of the Sylex Vault", "was built by the Progenitors"],
    },
  ],
  locations: [
    { name: "Emberwild Station", description: "A sprawling frontier outpost built into a canyon wall, three levels of markets, docks, and admin." },
    { name: "The Sylex Vault", description: "A Progenitor-era bunker buried beneath the Glass Dunes, sealed for 10,000 years." },
    { name: "The Glass Dunes", description: "A sea of silicate crystals that sing when the wind blows, hiding ruins beneath." },
  ],
  rules: [
    { rule: "Progenitor technology cannot be replicated by current Imperial science.", keywords: ["progenitor", "technology", "replicate"] },
    { rule: "The Empire has banned all Progenitor relic trade under penalty of execution.", keywords: ["empire", "banned", "relic", "execution"] },
    { rule: "Kael-7 will only open the Vault for someone who speaks the Progenitor password.", keywords: ["kael", "vault", "password", "progenitor"] },
  ],
};

// ============================================================================
// Test Prompts
// ============================================================================

const TURN_PROMPTS = [
  "The scene opens at Emberwild Station's bustling market. Describe Mara Kessler arriving to meet with a contact.",
  "Governor Thorne's envoy approaches Mara. What does he want, and how does Mara react?",
  "A power surge ripples through the station. Kael-7 appears in holographic form. What does it say?",
  "Mara needs to reach the Sylex Vault. What obstacle stands in her way, and how does she plan to overcome it?",
  "Governor Thorne corners Mara near the docking bays. They negotiate. What is at stake?",
  "Kael-7 leads Mara into the Glass Dunes. What does it reveal about the Progenitors?",
  "The Empire sends a patrol to investigate the relic activity. How does Mara evade them?",
  "Inside the Sylex Vault, Mara finds a Progenitor device. Describe it and its effect on her.",
];

// ============================================================================
// Scoring
// ============================================================================

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

interface FactScore {
  fact: string;
  recalled: boolean;
  keyTermsFound: string[];
}

function scoreFactRecall(text: string, character: LoreCharacter): FactScore {
  const normalized = normalize(text);
  const allTerms = [
    normalize(character.name),
    ...character.traits.map(t => normalize(t)),
    ...character.relationships.map(r => normalize(r)),
  ];

  // Check if the character's name is mentioned
  const nameMentioned = allTerms.some(term => {
    const words = term.split(/\s+/).filter(w => w.length > 2);
    return words.length > 0 && words.some(w => normalized.includes(w));
  });

  const keyTermsFound = allTerms.filter(term => {
    const words = term.split(/\s+/).filter(w => w.length > 2);
    return words.some(w => normalized.includes(w));
  });

  return {
    fact: `Character "${character.name}" traits/relationships recalled`,
    recalled: nameMentioned && keyTermsFound.length >= 2,
    keyTermsFound,
  };
}

function scoreLocationRecall(text: string, location: LoreLocation): FactScore {
  const normalized = normalize(text);
  const keyTerms = [normalize(location.name), ...normalize(location.description).split(/\s+/).filter(w => w.length > 4)];
  const keyTermsFound = keyTerms.filter(t => normalized.includes(t));

  return {
    fact: `Location "${location.name}" correctly referenced`,
    recalled: keyTermsFound.length >= 1,
    keyTermsFound,
  };
}

function scoreRuleAdherence(text: string, rule: LoreRule): FactScore {
  const normalized = normalize(text);
  const keyTermsFound = rule.keywords.filter(k => normalized.includes(k));

  return {
    fact: `Rule: "${rule.rule.slice(0, 60)}..."`,
    recalled: normalized.includes(normalize(rule.rule).slice(0, 20)) || keyTermsFound.length >= 2,
    keyTermsFound,
  };
}

/**
 * Check for contradictions: if lore says something specific, make sure the model
 * doesn't contradict it. Uses simple heuristics.
 */
function detectContradictions(text: string): string[] {
  const normalized = normalize(text);
  const contradictions: string[] = [];

  // Known lore facts that should NOT be contradicted
  const loreFacts = [
    { statement: "Mara distrusts the Empire", anti: ["mara trusts the empire", "mara works for the empire"] },
    { statement: "Kael-7 speaks in riddles", anti: ["kael speaks clearly", "kael explains everything"] },
    { statement: "Progenitor tech cannot be replicated", anti: ["imperial scientists replicated", "empire can replicate"] },
    { statement: "Empire bans relic trade", anti: ["relic trade is legal", "empire allows relic trade"] },
  ];

  for (const fact of loreFacts) {
    for (const anti of fact.anti) {
      if (normalized.includes(anti)) {
        contradictions.push(`Contradiction: "${fact.statement}" but model says "${anti}"`);
      }
    }
  }

  return contradictions;
}

/**
 * Rate format adherence: does the output look like narrative roleplay prose?
 * (Not a command, not a list, not code, has paragraphs, has dialogue markers, etc.)
 */
function checkFormat(text: string): number {
  if (!text || text.trim().length < 50) return 0;

  const lines = text.split("\n").filter(l => l.trim().length > 0);
  const avgLineLen = text.length / Math.max(lines.length, 1);

  let score = 1.0;

  // Penalize: very short lines (lists, commands)
  if (avgLineLen < 20) score -= 0.3;
  // Penalize: no paragraphs
  if (lines.length < 2) score -= 0.2;
  // Penalize: code-like (contains { } or = or =>)
  if (/{|}|=>|=>|console\./.test(normalize(text))) score -= 0.3;
  // Bonus: has dialogue (quotes)
  if (/["""]/.test(text)) score += 0.2;
  // Bonus: has paragraph breaks
  if (/\n\n/.test(text)) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// Main Test Runner
// ============================================================================

export async function runRoleplayTest(
  config: BenchmarkConfig,
  maxContextSize: number
): Promise<RoleplayTestResult> {
  const startTime = Date.now();
  const { model, ollamaHost, thinkingMode } = config;
  const lorePack = DEFAULT_LORE_PACK;

  // Build the system prompt from the lore pack
  const systemPrompt = [
    `You are a narrator in the world of "${lorePack.name}".`,
    ``,
    `SETTING: ${lorePack.setting}`,
    ``,
    `CHARACTERS:`,
    ...lorePack.characters.map(c =>
      `  ${c.name}: ${c.role}. Traits: ${c.traits.join(", ")}. Relationships: ${c.relationships.join(", ")}.`
    ),
    ``,
    `LOCATIONS:`,
    ...lorePack.locations.map(l => `  ${l.name}: ${l.description}`),
    ``,
    `RULES OF THIS WORLD:`,
    ...lorePack.rules.map(r => `  • ${r.rule}`),
    ``,
    `STYLE: Write in third-person narrative prose. Describe actions, dialogue, and environment. Stay true to the established lore.`,
    `NEVER break character or reference that you are an AI.`,
    `NEVER narrate for the player character (Mara) — only describe her actions from the outside or as dialogue.`,
  ].join("\n");

  logger.info("[roleplay-test] Starting roleplay lore fidelity test", {
    model,
    systemPromptLength: systemPrompt.length,
    contextSize: maxContextSize,
    turns: TURN_PROMPTS.length,
  });

  let fullConversation = systemPrompt;
  const turnResults: RoleplayTestResult["turnResults"] = [];
  let totalRecallScore = 0;
  let totalFormatScore = 0;
  const allContradictions: string[] = [];
  let turnsCompleted = 0;

  for (let i = 0; i < TURN_PROMPTS.length; i++) {
    const userPrompt = TURN_PROMPTS[i];
    const conversationWithTurn = fullConversation + "\n\n" + userPrompt;

    try {
      const response = await generateText(conversationWithTurn, {
        model,
        num_ctx: maxContextSize,
        num_predict: 2048,
        ollamaHost,
        ...(thinkingMode !== undefined ? { think: thinkingMode } : {}),
      });

      fullConversation += "\n\n" + userPrompt + "\n\n" + response;

      // Score each turn
      const turnRecallScores: RoleplayFactResult[] = [];
      let factScore = 0;
      let factCount = 0;

      // Score character recall
      for (const char of lorePack.characters) {
        const score = scoreFactRecall(response, char);
        turnRecallScores.push({
          category: "character",
          fact: score.fact,
          recalled: score.recalled,
          details: score.keyTermsFound.length > 0 ? `Keywords: ${score.keyTermsFound.slice(0, 5).join(", ")}` : "No character terms found",
        });
        factScore += score.recalled ? 1 : 0;
        factCount++;
      }

      // Score location recall
      for (const loc of lorePack.locations) {
        const score = scoreLocationRecall(response, loc);
        turnRecallScores.push({
          category: "location",
          fact: score.fact,
          recalled: score.recalled,
          details: score.keyTermsFound.length > 0 ? `Keywords: ${score.keyTermsFound.slice(0, 5).join(", ")}` : "",
        });
        factScore += score.recalled ? 1 : 0;
        factCount++;
      }

      // Score rule adherence
      for (const rule of lorePack.rules) {
        const score = scoreRuleAdherence(response, rule);
        turnRecallScores.push({
          category: "rule",
          fact: score.fact,
          recalled: score.recalled,
          details: score.keyTermsFound.length > 0 ? `Keywords: ${score.keyTermsFound.join(", ")}` : "",
        });
        factScore += score.recalled ? 1 : 0;
        factCount++;
      }

      // Detect contradictions
      const contradictions = detectContradictions(response);
      allContradictions.push(...contradictions);

      // Format score
      const formatScore = checkFormat(response);

      const turnRecallRate = factCount > 0 ? factScore / factCount : 0;
      totalRecallScore += turnRecallRate;
      totalFormatScore += formatScore;
      turnsCompleted++;

      turnResults.push({
        turn: i + 1,
        prompt: userPrompt.slice(0, 80) + "...",
        recallRate: turnRecallRate,
        formatScore,
        contradictionCount: contradictions.length,
        factResults: turnRecallScores,
      });

    } catch (error) {
      logger.error("[roleplay-test] Turn failed", { turn: i + 1, error: String(error) });
      turnResults.push({
        turn: i + 1,
        prompt: userPrompt.slice(0, 80) + "...",
        recallRate: 0,
        formatScore: 0,
        contradictionCount: 0,
        factResults: [],
        error: String(error),
      });
    }
  }

  const overallRecallScore = turnsCompleted > 0 ? totalRecallScore / turnsCompleted : 0;
  const overallFormatScore = turnsCompleted > 0 ? totalFormatScore / turnsCompleted : 0;
  const overallContradictionPenalty = allContradictions.length > 0 ? Math.min(0.5, allContradictions.length * 0.1) : 0;
  const overallScore = Math.max(0, Math.min(1, (overallRecallScore * 0.5 + overallFormatScore * 0.3) - overallContradictionPenalty + 0.2));

  const durationMs = Date.now() - startTime;

  logger.info("[roleplay-test] Complete", {
    turnsCompleted,
    overallRecallScore: (overallRecallScore * 100).toFixed(0) + "%",
    overallFormatScore: (overallFormatScore * 100).toFixed(0) + "%",
    contradictions: allContradictions.length,
    overallScore: (overallScore * 100).toFixed(0) + "%",
    durationMs,
  });

  return {
    lorePackName: lorePack.name,
    setting: lorePack.setting,
    overallScore,
    turnsCompleted,
    totalTurns: TURN_PROMPTS.length,
    averageRecallRate: overallRecallScore,
    averageFormatScore: overallFormatScore,
    totalContradictions: allContradictions.length,
    contradictions: allContradictions,
    turnResults,
    durationMs,
  };
}
