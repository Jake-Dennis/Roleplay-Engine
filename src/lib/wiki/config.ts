import fs from "fs";
import path from "path";

/**
 * Wiki configuration stored in `.wiki-config.json` at the wiki root.
 * Currently tracks folder display order. Custom folders are auto-discovered
 * from the filesystem, so no type registry is needed.
 */
export interface WikiConfig {
  /** Ordered list of folder names. Folders not in this list are appended alphabetically. */
  folderOrder: string[];
}

export const DEFAULT_FOLDER_ORDER: string[] = [
  "entities",
  "concepts",
  "sources",
  "synthesis",
  "_review",
];

const CONFIG_FILENAME = ".wiki-config.json";

/**
 * Read the wiki config for a given wiki root. Returns defaults if the config
 * file does not exist or is unreadable.
 */
export function readWikiConfig(wikiRoot: string): WikiConfig {
  const configPath = path.join(wikiRoot, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    return { folderOrder: [] };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as WikiConfig;
    if (!parsed || !Array.isArray(parsed.folderOrder)) {
      return { folderOrder: [] };
    }
    return { folderOrder: parsed.folderOrder.filter((s) => typeof s === "string") };
  } catch {
    return { folderOrder: [] };
  }
}

/**
 * Write the wiki config atomically (write to .tmp then rename).
 */
export function writeWikiConfig(wikiRoot: string, config: WikiConfig): void {
  if (!fs.existsSync(wikiRoot)) {
    fs.mkdirSync(wikiRoot, { recursive: true });
  }
  const configPath = path.join(wikiRoot, CONFIG_FILENAME);
  const tmpPath = `${configPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmpPath, configPath);
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
