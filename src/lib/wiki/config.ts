import fs from "fs";
import path from "path";
import type { WikiConfigV2, WikiTypeDef } from "./config-types";
import { readAndMigrateConfig, writeWikiConfigV2 } from "./config-migration";

/**
 * Wiki configuration stored in `.wiki-config.json` at the wiki root.
 * v2 adds full type registry with subtypes and folder mappings.
 */
export type WikiConfig = WikiConfigV2;

export const DEFAULT_FOLDER_ORDER: string[] = [
  "entities",
  "concepts",
  "sources",
  "synthesis",
  "_review",
];

const CONFIG_FILENAME = ".wiki-config.json";

/**
 * Read the wiki config for a given wiki root.
 * Returns v2 config (migrating from v1 if needed).
 */
export function readWikiConfig(wikiRoot: string): WikiConfigV2 {
  return readAndMigrateConfig(wikiRoot);
}

/**
 * Write the wiki config atomically (write to .tmp then rename).
 * Accepts full v2 config.
 */
export function writeWikiConfig(wikiRoot: string, config: WikiConfigV2): void {
  writeWikiConfigV2(wikiRoot, config);
}

/**
 * Resolve the display order of folders under a wiki root.
 *
 * 1. Read the config's `folderOrder` (custom ordering).
 * 2. For each folder that exists on disk, place it in the order from #1.
 * 3. Append any folders not in the config alphabetically.
 * 4. Always excludes dotfiles and the config file itself.
 */
export function getResolvedFolderOrder(wikiRoot: string): string[] {
  if (!fs.existsSync(wikiRoot)) return [];

  const allFolders = fs
    .readdirSync(wikiRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  const config = readWikiConfig(wikiRoot);
  const configOrder = config.folderOrder.filter((f) => allFolders.includes(f));

  const missing = allFolders.filter((f) => !configOrder.includes(f)).sort();

  return [...configOrder, ...missing];
}

/**
 * Add a folder to the wiki config, creating the directory if missing.
 * Returns the resolved folder list after addition.
 */
export function addFolderToConfig(wikiRoot: string, folderName: string): string[] {
  const config = readWikiConfig(wikiRoot);
  if (!config.folderOrder.includes(folderName)) {
    config.folderOrder.push(folderName);
  }
  // Create the directory
  const folderPath = path.join(wikiRoot, folderName);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  writeWikiConfig(wikiRoot, config);
  return getResolvedFolderOrder(wikiRoot);
}

/**
 * Get the type registry for a wiki root (convenience wrapper).
 * Reads v2 config and returns normalized registry.
 */
export function getTypeRegistryForConfig(wikiRoot: string): {
  types: Record<string, WikiTypeDef>;
  subtypeFolders: Record<string, string>;
  fallbackFolder: string;
} {
  const config = readWikiConfig(wikiRoot);
  return {
    types: config.types,
    subtypeFolders: config.subtypeFolders,
    fallbackFolder: config.types["entity"]?.folder || "entities",
  };
}
