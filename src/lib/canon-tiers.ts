/**
 * Canon Tier System
 *
 * Five-tier canon system applied to all entities (locations, NPCs, events, lore).
 */

export interface CanonTier {
  value: string;
  label: string;
  locked: boolean;
  description: string;
}

export const CANON_TIERS: CanonTier[] = [
  {
    value: "immutable_canon",
    label: "Immutable Canon",
    locked: true,
    description: "Source material facts. Cannot be contradicted.",
  },
  {
    value: "soft_canon",
    label: "Soft Canon",
    locked: false,
    description: "Expandable without contradiction. Can be extended.",
  },
  {
    value: "generated_lore",
    label: "Generated Lore",
    locked: false,
    description: "AI-generated and validated. Only overridden by user.",
  },
  {
    value: "session_lore",
    label: "Session Lore",
    locked: false,
    description: "Temporary narrative state. Session-scoped.",
  },
  {
    value: "rumor",
    label: "Rumor",
    locked: false,
    description: "Unverified information. May be true or false.",
  },
];

/**
 * Map old canon values to new 5-tier system
 */
export const CANON_MIGRATION_MAP: Record<string, string> = {
  canon: "immutable_canon",
  "immutable_canon": "immutable_canon",
  soft_canon: "soft_canon",
  generated: "generated_lore",
  generated_lore: "generated_lore",
  fanon: "session_lore",
  session_lore: "session_lore",
  draft: "session_lore",
  deprecated: "rumor",
  rumor: "rumor",
};

/**
 * Migrate a canon_status value to the new 5-tier system
 */
export function migrateCanonStatus(value: string | null): string {
  if (!value) return "generated_lore";
  return CANON_MIGRATION_MAP[value] || "generated_lore";
}
