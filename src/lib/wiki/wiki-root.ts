/**
 * Wiki Root Resolver
 *
 * Shared utility to resolve the wiki root directory for a user/universe.
 */

import path from "path";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { APP_CONFIG } from "@/lib/config";

/**
 * Resolve the wiki root directory for a user/universe.
 */
export function getWikiRoot(userId: string, universeId?: string): string {
  const dataDir = APP_CONFIG.dataDir;
  const base = path.join(dataDir, userId, "wiki");
  if (!universeId) return base;

  // Sanitize universeId to prevent path traversal
  const safeUniverseId = path.basename(universeId);
  const resolved = path.join(base, safeUniverseId);

  // Verify resolved path is within the wiki base
  if (!isPathWithinRoot(resolved, base)) {
    throw new Error("Invalid universeId: path traversal detected");
  }

  return resolved;
}
