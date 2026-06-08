/**
 * Migration helper for upgrading .wiki-config.json from v1 to v2.
 *
 * v1 config only had folderOrder. v2 adds the full type registry with
 * types, subtypes, and subtypeFolders mappings.
 */

import fs from "fs";
import path from "path";
import type { WikiConfigV1, WikiConfigV2, WikiConfigAny } from "./config-types";
import {
  DEFAULT_TYPE_DEFS,
  DEFAULT_SUBTYPE_FOLDERS,
  isConfigV2,
} from "./config-types";

const CONFIG_FILENAME = ".wiki-config.json";

/**
 * Migrate a v1 config object to v2.
 * If the config is already v2, returns it unchanged (idempotent).
 */
export function migrateConfigV1toV2(config: WikiConfigAny): WikiConfigV2 {
  if (isConfigV2(config)) {
    return config;
  }

  // v1 config: only has folderOrder
  const v1Config = config as WikiConfigV1;

  return {
    version: 2,
    folderOrder: v1Config.folderOrder || [],
    types: { ...DEFAULT_TYPE_DEFS },
    subtypeFolders: { ...DEFAULT_SUBTYPE_FOLDERS },
  };
}

/**
 * Read the wiki config and migrate to v2 if needed.
 * Persists the upgraded config back to disk on first read.
 */
export function readAndMigrateConfig(wikiRoot: string): WikiConfigV2 {
  const configPath = path.join(wikiRoot, CONFIG_FILENAME);

  // Read raw config (v1 format)
  let rawConfig: WikiConfigAny;
  if (!fs.existsSync(configPath)) {
    // No config file - return defaults as v2
    rawConfig = { folderOrder: [] };
  } else {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      rawConfig = JSON.parse(raw) as WikiConfigAny;
    } catch {
      rawConfig = { folderOrder: [] };
    }
  }

  // Migrate to v2
  const v2Config = migrateConfigV1toV2(rawConfig);

  // Persist if it was v1 (or missing)
  if (!isConfigV2(rawConfig)) {
    writeWikiConfigV2(wikiRoot, v2Config);
  }

  return v2Config;
}

/**
 * Write a v2 config to disk atomically.
 */
export function writeWikiConfigV2(wikiRoot: string, config: WikiConfigV2): void {
  if (!fs.existsSync(wikiRoot)) {
    fs.mkdirSync(wikiRoot, { recursive: true });
  }
  const configPath = path.join(wikiRoot, CONFIG_FILENAME);
  const tmpPath = `${configPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmpPath, configPath);
}

/**
 * Add a new type to the v2 config.
 */
export function addTypeToConfig(
  wikiRoot: string,
  typeName: string,
  typeDef: { icon: string; folder: string; subtypes: string[] }
): WikiConfigV2 {
  const config = readAndMigrateConfig(wikiRoot);
  config.types[typeName] = typeDef;

  // Add subtype folder mappings
  for (const subtype of typeDef.subtypes) {
    config.subtypeFolders[subtype] = `${typeDef.folder}/${subtype}s`;
  }

  // Add folder to folderOrder if not present
  if (!config.folderOrder.includes(typeDef.folder)) {
    config.folderOrder.push(typeDef.folder);
  }

  writeWikiConfigV2(wikiRoot, config);
  return config;
}

/**
 * Add a subtype to an existing type in the v2 config.
 */
export function addSubtypeToConfig(
  wikiRoot: string,
  typeName: string,
  subtype: string,
  folder?: string
): WikiConfigV2 {
  const config = readAndMigrateConfig(wikiRoot);

  if (!config.types[typeName]) {
    throw new Error(`Type "${typeName}" does not exist in config`);
  }

  if (!config.types[typeName].subtypes.includes(subtype)) {
    config.types[typeName].subtypes.push(subtype);
  }

  // Determine folder path
  const subtypeFolder = folder || `${config.types[typeName].folder}/${subtype}s`;
  config.subtypeFolders[subtype] = subtypeFolder;

  writeWikiConfigV2(wikiRoot, config);
  return config;
}

/**
 * Remove a subtype from a type in the v2 config.
 * Throws if any pages use this subtype (to be checked by caller).
 */
export function removeSubtypeFromConfig(
  wikiRoot: string,
  typeName: string,
  subtype: string
): WikiConfigV2 {
  const config = readAndMigrateConfig(wikiRoot);

  if (!config.types[typeName]) {
    throw new Error(`Type "${typeName}" does not exist in config`);
  }

  const idx = config.types[typeName].subtypes.indexOf(subtype);
  if (idx === -1) {
    throw new Error(`Subtype "${subtype}" not found in type "${typeName}"`);
  }

  config.types[typeName].subtypes.splice(idx, 1);
  delete config.subtypeFolders[subtype];

  writeWikiConfigV2(wikiRoot, config);
  return config;
}

/**
 * Remove a type from the v2 config.
 * Throws if the type has subtypes or if any pages use this type.
 */
export function removeTypeFromConfig(wikiRoot: string, typeName: string): WikiConfigV2 {
  const config = readAndMigrateConfig(wikiRoot);

  if (!config.types[typeName]) {
    throw new Error(`Type "${typeName}" does not exist in config`);
  }

  if (config.types[typeName].subtypes.length > 0) {
    throw new Error(
      `Cannot remove type "${typeName}": it still has subtypes. Remove subtypes first.`
    );
  }

  delete config.types[typeName];
  const folder = config.types[typeName]?.folder;
  if (folder) {
    config.folderOrder = config.folderOrder.filter((f) => f !== folder);
  }

  writeWikiConfigV2(wikiRoot, config);
  return config;
}