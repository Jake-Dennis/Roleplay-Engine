/**
 * Wiki Type Registry Accessor
 *
 * Provides a cached, normalized view of the wiki's type registry.
 * Reads the v2 config (migrating from v1 if needed) and returns
 * a ready-to-use registry object.
 */

import type { WikiTypeDef } from "./config-types";
import { readAndMigrateConfig } from "./config-migration";

/** Normalized type registry returned by getTypeRegistry. */
export interface TypeRegistry {
  /** Map of type name -> type definition. */
  types: Record<string, WikiTypeDef>;
  /** Map of subtype name -> folder path (e.g., "character" -> "entities/characters"). */
  subtypeFolders: Record<string, string>;
  /** Fallback folder for entity pages when type is not configured. */
  fallbackFolder: string;
}

/** In-memory cache for the registry, keyed by wikiRoot. */
const registryCache = new Map<string, TypeRegistry>();

/**
 * Get the type registry for a wiki root.
 *
 * Reads and migrates the config to v2, then returns a normalized registry:
 * - types: the full type definitions from config
 * - subtypeFolders: subtype -> folder path mappings
 * - fallbackFolder: config.types['entity']?.folder || 'entities'
 *
 * Results are cached per wikiRoot for the lifetime of the request.
 */
export function getTypeRegistry(wikiRoot: string): TypeRegistry {
  // Check cache first
  const cached = registryCache.get(wikiRoot);
  if (cached) {
    return cached;
  }

  // Read and migrate config
  const config = readAndMigrateConfig(wikiRoot);

  // Build normalized registry
  const registry: TypeRegistry = {
    types: config.types,
    subtypeFolders: config.subtypeFolders,
    fallbackFolder: config.types["entity"]?.folder || "entities",
  };

  // Cache for request lifetime
  registryCache.set(wikiRoot, registry);
  return registry;
}

/**
 * Clear the registry cache for a specific wiki root (or all if no root provided).
 * Useful for testing or after config changes.
 */
export function clearTypeRegistryCache(wikiRoot?: string): void {
  if (wikiRoot) {
    registryCache.delete(wikiRoot);
  } else {
    registryCache.clear();
  }
}

/**
 * Invalidate and refresh the registry for a wiki root.
 * Forces a re-read of the config from disk.
 */
export function refreshTypeRegistry(wikiRoot: string): TypeRegistry {
  clearTypeRegistryCache(wikiRoot);
  return getTypeRegistry(wikiRoot);
}