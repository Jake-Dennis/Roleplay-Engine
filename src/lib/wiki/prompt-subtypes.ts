/**
 * @deprecated This file is not currently imported by any source module.
 * Kept for reference. Will be removed in a future cleanup pass once
 * all consumers are verified.
 * @reason Subtype prompt builder is only used by its own test file
 * (prompt-subtypes.test.ts) but has no production consumers. The
 * subtype/type-registry system exists but the prompt integration
 * was never wired into the actual prompt-builder pipeline.
 */

/**
 * Prompt Subtype Helper
 *
 * Builds the subtype instruction section for LLM prompts based on the
 * wiki's type registry. This replaces hardcoded subtype lists with
 * config-driven ones.
 */

import type { TypeRegistry } from "./type-registry";

/**
 * Build a prompt section listing available subtypes for entity and concept types.
 *
 * Returns a string like:
 * "For each entity, pick a subtype from: character, location, item, faction, organization, creature
 * For each concept, pick a subtype from: theme, rule, mechanic, lore, event, tradition"
 *
 * Custom types and subtypes from the registry are included automatically.
 */
export function buildSubtypePromptSection(registry: TypeRegistry): string {
  const lines: string[] = [];

  // Entity subtypes
  const entityType = registry.types["entity"];
  if (entityType && entityType.subtypes.length > 0) {
    lines.push(
      `For each entity, pick a subtype from: ${entityType.subtypes.join(", ")}`
    );
  }

  // Concept subtypes
  const conceptType = registry.types["concept"];
  if (conceptType && conceptType.subtypes.length > 0) {
    lines.push(
      `For each concept, pick a subtype from: ${conceptType.subtypes.join(", ")}`
    );
  }

  // Include any custom types that have subtypes
  for (const [typeName, typeDef] of Object.entries(registry.types)) {
    if (typeName === "entity" || typeName === "concept") continue;
    if (typeDef.subtypes.length > 0) {
      lines.push(
        `For each ${typeName}, pick a subtype from: ${typeDef.subtypes.join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

/**
 * Build a compact subtype listing for use in smaller prompts.
 * Returns: "entity: character, location, item | concept: theme, rule, mechanic"
 */
export function buildCompactSubtypeList(registry: TypeRegistry): string {
  const parts: string[] = [];

  for (const [typeName, typeDef] of Object.entries(registry.types)) {
    if (typeDef.subtypes.length > 0) {
      parts.push(`${typeName}: ${typeDef.subtypes.join(", ")}`);
    }
  }

  return parts.join(" | ");
}
