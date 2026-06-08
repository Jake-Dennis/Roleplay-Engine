/**
 * Type definitions for the wiki type registry system (v2 config).
 *
 * This replaces hardcoded type/subtype constants scattered across the codebase
 * with a user-editable configuration stored in `.wiki-config.json`.
 */

/** v1 wiki configuration (legacy) - only had folderOrder. */
export interface WikiConfigV1 {
  /** Ordered list of folder names. Folders not in this list are appended alphabetically. */
  folderOrder: string[];
}

/** Represents a single wiki type definition (entity, concept, source, synthesis, or custom). */
export interface WikiTypeDef {
  /** Display icon (Lucide icon name). */
  icon: string;
  /** Default folder name where pages of this type are stored. */
  folder: string;
  /** Sub-types available for this type. */
  subtypes: string[];
}

/** v2 wiki configuration with full type registry. */
export interface WikiConfigV2 {
  /** Config schema version. */
  version: 2;
  /** Ordered list of folder names (from v1). */
  folderOrder: string[];
  /** Type definitions map. Keys are type names (entity, concept, etc.). */
  types: Record<string, WikiTypeDef>;
  /** Maps subtype names to their folder paths (e.g., "character" -> "entities/characters"). */
  subtypeFolders: Record<string, string>;
}

/** Union of v1 and v2 config for migration purposes. */
export type WikiConfigAny = WikiConfigV1 | WikiConfigV2;

/** Default type definitions matching the current hardcoded values. */
export const DEFAULT_TYPE_DEFS: Record<string, WikiTypeDef> = {
  entity: {
    icon: "user",
    folder: "entities",
    subtypes: ["character", "location", "item", "faction", "organization", "creature"],
  },
  concept: {
    icon: "book-open",
    folder: "concepts",
    subtypes: ["theme", "rule", "mechanic", "lore", "event", "tradition"],
  },
  source: {
    icon: "file-text",
    folder: "sources",
    subtypes: [],
  },
  synthesis: {
    icon: "sparkles",
    folder: "synthesis",
    subtypes: [],
  },
};

/** Default subtype folder mappings. */
export const DEFAULT_SUBTYPE_FOLDERS: Record<string, string> = {
  character: "entities/characters",
  location: "entities/locations",
  item: "entities/items",
  faction: "entities/factions",
  organization: "entities/organizations",
  creature: "entities/creatures",
  theme: "concepts/themes",
  rule: "concepts/rules",
  mechanic: "concepts/mechanics",
  lore: "concepts/lore",
  event: "concepts/events",
  tradition: "concepts/traditions",
};

/**
 * Type guard to check if a config is v2.
 */
export function isConfigV2(config: WikiConfigAny): config is WikiConfigV2 {
  return "version" in config && config.version === 2 && "types" in config;
}