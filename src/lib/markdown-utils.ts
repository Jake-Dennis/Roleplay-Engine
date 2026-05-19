/**
 * Shared Markdown Utilities
 *
 * Generic utilities for building and parsing markdown files with YAML frontmatter.
 * Shared markdown utilities — used by the relationship system and wiki.
 *
 * Functions here have no DB or filesystem dependencies beyond what's passed to them.
 */

/**
 * Frontmatter fields for markdown files with entity metadata.
 */
export interface MarkdownFrontmatter {
  id: string;
  name: string;
  type: "location" | "npc" | "event" | "relationship";
  importance?: string;
  tags?: string[];
  canon_tier?: string;
  parent_id?: string | null;
  created_at?: string;
}

// Re-export under old name for backward compatibility during migration
/** @deprecated Use MarkdownFrontmatter instead */
export type LoreFrontmatter = MarkdownFrontmatter;

/**
 * Generate markdown content with YAML frontmatter
 */
export function buildMarkdown(frontmatter: MarkdownFrontmatter, body: string = ""): string {
  const frontmatterLines: string[] = ["---"];
  frontmatterLines.push(`id: ${frontmatter.id}`);
  frontmatterLines.push(`name: "${frontmatter.name.replace(/"/g, '\\"')}"`);
  frontmatterLines.push(`type: ${frontmatter.type}`);
  if (frontmatter.importance) frontmatterLines.push(`importance: ${frontmatter.importance}`);
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    frontmatterLines.push(`tags:\n${frontmatter.tags.map((t: string) => `  - "${t}"`).join("\n")}`);
  }
  if (frontmatter.canon_tier) frontmatterLines.push(`canon_tier: ${frontmatter.canon_tier}`);
  if (frontmatter.parent_id) frontmatterLines.push(`parent_id: ${frontmatter.parent_id}`);
  if (frontmatter.created_at) frontmatterLines.push(`created_at: ${frontmatter.created_at}`);
  frontmatterLines.push("---");
  frontmatterLines.push("");
  if (body) frontmatterLines.push(body);
  return frontmatterLines.join("\n");
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns { frontmatter, body }
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatterStr = match[1];
  const body = match[2] || "";
  const frontmatter: Record<string, any> = {};

  for (const line of frontmatterStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse arrays (simple inline arrays)
    if (value.startsWith("[")) {
      try {
        frontmatter[key] = JSON.parse(value);
        continue;
      } catch { /* fall through */ }
    }

    // Parse booleans
    if (value === "true") { frontmatter[key] = true; continue; }
    if (value === "false") { frontmatter[key] = false; continue; }

    // Parse numbers
    if (!isNaN(Number(value)) && value !== "") {
      frontmatter[key] = Number(value);
      continue;
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}
