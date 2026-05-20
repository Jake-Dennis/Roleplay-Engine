/**
 * Wiki Root Resolver
 *
 * Shared utility to resolve the wiki root directory for a user/universe.
 */

/**
 * Resolve the wiki root directory for a user/universe.
 */
export function getWikiRoot(userId: string, universeId?: string): string {
  const dataDir = process.env.DATA_DIR || "./data";
  return universeId
    ? `${dataDir}/${userId}/wiki/${universeId}`
    : `${dataDir}/${userId}/wiki`;
}
