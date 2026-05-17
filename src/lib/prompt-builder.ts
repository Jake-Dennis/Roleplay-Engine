/**
 * Prompt Builder
 *
 * Assembles structured prompts for LLM generation from retrieved context.
 * Extracted from retrieval.ts for separation of concerns.
 *
 * Prompt sections (in order):
 * 1. System prompt
 * 2. Character instructions (optional)
 * 3. Canon context
 * 4. Scene state
 * 5. Intent classification
 * 6. Known world (lore)
 * 7. Relationships
 * 8. Recent history (messages)
 */

import type { RetrievedContext } from "@/lib/retrieval";

/**
 * Assemble a complete system + context prompt for the AI.
 */
export function assemblePrompt(
  ctx: RetrievedContext,
  systemPrompt: string,
  characterInstructions?: string | null
): string {
  const parts: string[] = [];

  // System prompt — always first
  parts.push(systemPrompt);

  // Character instructions
  if (characterInstructions) {
    parts.push(`[CHARACTER INSTRUCTIONS]\n${characterInstructions}`);
  }

  // Canon
  if (ctx.canonContext) {
    parts.push(ctx.canonContext);
  }

  // Scene state
  if (ctx.scene.location || ctx.scene.goal || ctx.scene.tone) {
    const sceneParts: string[] = ["[CURRENT SCENE]"];
    if (ctx.scene.location) sceneParts.push(`Location: ${ctx.scene.location}`);
    if (ctx.scene.goal) sceneParts.push(`Goal: ${ctx.scene.goal}`);
    if (ctx.scene.tone) sceneParts.push(`Tone: ${ctx.scene.tone}`);
    if (ctx.scene.activeNpcs.length > 0)
      sceneParts.push(`Present: ${ctx.scene.activeNpcs.join(", ")}`);
    parts.push(sceneParts.join("\n"));
  }

  // Intent
  parts.push(buildIntentContext(ctx.intent));

  // Lore
  if (ctx.lore.entries.length > 0) {
    const loreParts = ctx.lore.entries.map(
      (e) => `[${e.type.toUpperCase()}] ${e.name}: ${e.description}`
    );
    parts.push("[KNOWN WORLD]\n" + loreParts.join("\n"));
  }

  // Relationships
  if (ctx.relationships.relationships.length > 0) {
    const relParts = ctx.relationships.relationships.map(
      (r) => `${r.source} → ${r.target}: ${r.state || "neutral"}`
    );
    parts.push("[RELATIONSHIPS]\n" + relParts.join("\n"));
  }

  // Recent messages — the most contextually important
  parts.push("[RECENT HISTORY]");
  for (const msg of ctx.recentMessages.messages) {
    const speaker = msg.senderId === null ? "Narrator" : "Player";
    parts.push(`${speaker}: ${msg.content}`);
  }

  return parts.join("\n\n");
}

/**
 * Build intent context section for prompt
 */
export function buildIntentContext(intent: string): string {
  const intentDescriptions: Record<string, string> = {
    exploration: "The user is exploring, investigating, or searching.",
    combat: "The user is engaging in combat or confrontation.",
    social: "The user is talking, negotiating, or persuading.",
    investigation: "The user is searching for clues or solving mysteries.",
    rest: "The user is resting or taking a break.",
    travel: "The user is moving between locations.",
    ritual: "The user is performing magic or a ritual.",
  };

  const description = intentDescriptions[intent] || "The user is interacting socially.";
  return `[INTENT: ${intent.toUpperCase()}]\n${description}`;
}

/**
 * Assemble prompt with automatic context budget management
 */
export function assemblePromptWithBudget(
  ctx: RetrievedContext,
  systemPrompt: string,
  maxTokens: number = 6000,
  characterInstructions?: string | null
): string {
  const budgetedCtx = applyContextBudget(ctx, maxTokens);
  return assemblePrompt(budgetedCtx, systemPrompt, characterInstructions);
}

/**
 * Rough token estimate (chars / 4 for English text)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate context to fit within a token budget
 */
export function applyContextBudget(
  ctx: RetrievedContext,
  maxTokens: number = 6000
): RetrievedContext {
  const overheadTokens = 500;
  const availableTokens = maxTokens - overheadTokens;

  if (availableTokens <= 0) {
    return {
      ...ctx,
      lore: { entries: [] },
      relationships: { relationships: [] },
      canonContext: null,
      recentMessages: {
        messages: ctx.recentMessages.messages.slice(-5),
      },
    };
  }

  const msgBudget = Math.floor(availableTokens * 0.6);
  const loreBudget = Math.floor(availableTokens * 0.25);
  const relBudget = Math.floor(availableTokens * 0.1);

  // Truncate messages (keep most recent)
  let msgTokens = 0;
  const truncatedMessages = [];
  const reversed = [...ctx.recentMessages.messages].reverse();
  for (const msg of reversed) {
    const t = estimateTokens(msg.content);
    if (msgTokens + t > msgBudget && truncatedMessages.length > 0) break;
    msgTokens += t;
    truncatedMessages.unshift(msg);
  }

  // Truncate lore
  let loreTokens = 0;
  const truncatedLore: { id: number; name: string; description: string; type: string }[] = [];
  for (const entry of ctx.lore.entries) {
    const t = estimateTokens(entry.name + entry.description);
    if (loreTokens + t > loreBudget && truncatedLore.length > 0) break;
    loreTokens += t;
    truncatedLore.push(entry);
  }

  // Truncate relationships
  let relTokens = 0;
  const truncatedRels: { source: string; target: string; state: string | null }[] = [];
  for (const rel of ctx.relationships.relationships) {
    const t = estimateTokens(rel.source + rel.target + (rel.state || ""));
    if (relTokens + t > relBudget && truncatedRels.length > 0) break;
    relTokens += t;
    truncatedRels.push(rel);
  }

  return {
    ...ctx,
    recentMessages: { messages: truncatedMessages },
    lore: { entries: truncatedLore },
    relationships: { relationships: truncatedRels },
  };
}
