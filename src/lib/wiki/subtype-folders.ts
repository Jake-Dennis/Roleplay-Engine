/**
 * Subtype Folder Resolver
 *
 * Resolves the folder path for a given subtype or type using the wiki's type registry.
 * This enables the 2-level folder structure: entities/characters/, concepts/events/, etc.
 */

import type { TypeRegistry } from "./type-registry";

/**
 * Get the folder path for a specific subtype.
 * Falls back to the type's base folder if subtype not found.
 */
export function folderForSubtype(subtype: string, registry: TypeRegistry): string {
  // Check subtypeFolders map first
  if (registry.subtypeFolders[subtype]) {
    return registry.subtypeFolders[subtype];
  }

  // Fallback: try to derive from registry types
  for (const typeDef of Object.values(registry.types)) {
    if (typeDef.subtypes.includes(subtype)) {
      return `${typeDef.folder}/${subtype}s`; // e.g., entities/characters
    }
  }

  // Final fallback to entity folder
  return registry.fallbackFolder;
}

/**
 * Get the base folder for a type (e.g., "entity" -> "entities").
 */
export function folderForType(type: string, registry: TypeRegistry): string {
  return registry.types[type]?.folder || registry.fallbackFolder;
}

/**
 * Get the folder path for a page based on its frontmatter.
 * Priority: subtype -> type -> fallback.
 */
export function folderForPage(frontmatter: Record<string, unknown>, registry: TypeRegistry): string {
  // If page has subtype, use it
  if (typeof frontmatter.subtype === "string" && frontmatter.subtype) {
    return folderForSubtype(frontmatter.subtype, registry);
  }

  // Otherwise use type
  if (typeof frontmatter.type === "string" && frontmatter.type) {
    return folderForType(frontmatter.type, registry);
  }

  // Final fallback
  return registry.fallbackFolder;
}

/**
 * Reverse lookup: given a folder path, find the subtype.
 * Returns null if not a subtype folder.
 */
export function subtypeFromFolder(folderPath: string, registry: TypeRegistry): string | null {
  // Check if folderPath matches a known subtype folder
  for (const [subtype, folder] of Object.entries(registry.subtypeFolders)) {
    if (folder === folderPath) {
      return subtype;
    }
    // Also check with trailing slash
    if (folder === folderPath.replace(/\/$/, "")) {
      return subtype;
    }
  }
  return null;
}