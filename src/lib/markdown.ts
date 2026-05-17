/**
 * Markdown + Frontmatter Utilities
 *
 * Provides parsing and stringifying of YAML frontmatter in markdown content.
 * Supports Obsidian-style lore editing with wikilink extraction.
 */

export interface FrontmatterData {
  id?: string;
  name?: string;
  entity_type?: string;
  canon_status?: string;
  location?: string;
  importance?: string;
  relationships?: string[];
  tags?: string[];
  [key: string]: unknown;
}

export interface ParsedMarkdown {
  frontmatter: FrontmatterData;
  content: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns frontmatter data and the remaining content.
 */
export function parseFrontmatter(markdown: string): ParsedMarkdown {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content: markdown };
  }

  const rawYaml = match[1];
  const content = markdown.slice(match[0].length).trimStart();

  // Simple YAML parser (handles basic key-value, arrays, and nested objects)
  const frontmatter = parseSimpleYaml(rawYaml);

  return { frontmatter, content };
}

/**
 * Simple YAML parser for frontmatter.
 * Handles: strings, numbers, arrays, and basic nested structures.
 */
function parseSimpleYaml(yaml: string): FrontmatterData {
  const result: FrontmatterData = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentArray: string[] = [];
  let inArray = false;

  function flushArray() {
    if (currentKey && inArray && currentArray.length > 0) {
      result[currentKey] = currentArray;
      currentArray = [];
      inArray = false;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Check for array item
    if (trimmed.startsWith("- ") && currentKey) {
      inArray = true;
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Flush any pending array
    flushArray();

    // Check for key-value pair
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value) {
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, "");
        result[key] = cleanValue;
        currentKey = key;
      } else {
        // Value might be an array on next lines
        currentKey = key;
        inArray = false;
      }
    }
  }

  // Flush any remaining array
  flushArray();

  return result;
}

/**
 * Stringify frontmatter data into YAML format.
 */
export function stringifyFrontmatter(data: FrontmatterData, content: string): string {
  const yamlLines = ["---"];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      for (const item of value) {
        yamlLines.push(`  - ${item}`);
      }
    } else {
      const strValue = typeof value === "string" ? value : String(value);
      // Quote strings that contain special characters
      const needsQuotes = /[:{}\[\],&*?|>!%@#\-]/.test(strValue);
      yamlLines.push(`${key}: ${needsQuotes ? `"${strValue}"` : strValue}`);
    }
  }

  yamlLines.push("---", "");

  return yamlLines.join("\n") + content;
}

/**
 * Extract wikilinks from markdown content.
 * Returns array of { target, displayText } objects.
 * Supports: [[Entity Name]] and [[display text|Entity Name]]
 */
export function extractWikilinks(content: string): { target: string; displayText: string }[] {
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links: { target: string; displayText: string }[] = [];
  let match;

  while ((match = wikilinkRegex.exec(content)) !== null) {
    const target = match[2] || match[1]; // [[display|target]] or [[target]]
    const displayText = match[1];
    links.push({ target: target.trim(), displayText: displayText.trim() });
  }

  return links;
}

/**
 * Infer link type from context pattern.
 */
export function inferLinkType(context: string): string {
  const lower = context.toLowerCase();
  if (/(caused by|result of|because)/.test(lower)) return "caused_by";
  if (/(part of|within|inside)/.test(lower)) return "part_of";
  if (/(nearby|close to|next to)/.test(lower)) return "nearby";
  if (/(located in|at|in)/.test(lower)) return "located_in";
  return "mentions";
}
