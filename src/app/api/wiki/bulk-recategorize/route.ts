import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { withErrorHandler } from "@/lib/with-error-handler";
import { badRequestError, requireJson } from "@/lib/error-response";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { bulkRecategorize, type RecategorizeFilter, type RecategorizeChanges } from "@/lib/wiki/bulk-recategorize";
import fs from "fs";

/**
 * POST /api/wiki/bulk-recategorize
 *
 * Find wiki pages matching the given filter and apply frontmatter changes
 * (type, subtype, tags, status) in bulk. When subtype or type changes cause
 * a folder move, the file is moved and path-based wikilinks are rewritten.
 *
 * By default this endpoint runs in **dry-run mode** so callers can preview
 * the result before committing. Set `dryRun: false` to execute.
 *
 * Request body:
 * ```json
 * {
 *   "filter": { "type": "entity", "subtype": "character" },
 *   "changes": { "newSubtype": "item", "addTags": ["magic"] },
 *   "dryRun": true
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "changes": [
 *     {
 *       "path": "entities/characters/gandalf.md",
 *       "proposed": {
 *         "subtype": "item",
 *         "tags": ["magic", "wizard"],
 *         "newFolder": "entities/items"
 *       }
 *     }
 *   ],
 *   "errors": [],
 *   "totalAffected": 1
 * }
 * ```
 *
 * @throws 400 - If `changes` is missing or malformed
 * @throws 401 - If authentication fails
 * @throws 415 - If Content-Type is not application/json
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  requireJson(request);
  const body = await request.json();
  const { filter, changes, dryRun } = body as {
    filter?: RecategorizeFilter;
    changes?: RecategorizeChanges;
    dryRun?: boolean;
  };

  // Validate changes object
  if (!changes || Object.keys(changes).length === 0) {
    return badRequestError("changes object is required and must contain at least one field");
  }

  // At least one change field must be present
  const hasValidChange =
    changes.newSubtype !== undefined ||
    changes.newType !== undefined ||
    changes.newTags !== undefined ||
    changes.newStatus !== undefined ||
    (changes.addTags !== undefined && changes.addTags.length > 0) ||
    (changes.removeTags !== undefined && changes.removeTags.length > 0);

  if (!hasValidChange) {
    return badRequestError(
      "changes must contain at least one of: newSubtype, newType, newTags, newStatus, addTags, removeTags",
    );
  }

  // Resolve wiki root
  const wikiRoot = getWikiRoot(userId);
  if (!fs.existsSync(wikiRoot)) {
    return badRequestError("Wiki root does not exist");
  }

  // Default to dry-run for safety
  const isDryRun = dryRun !== false;
  const result = bulkRecategorize(filter ?? {}, changes, wikiRoot, { dryRun: isDryRun });

  return NextResponse.json(result);
});
