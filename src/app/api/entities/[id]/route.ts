import { withErrorHandler } from "@/lib/with-error-handler";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import {
  requireJson,
  badRequestError,
  notFoundError,
} from "@/lib/error-response";
import { validateLength } from "@/lib/validation";
import {
  getEntity,
  addAlias,
  findAliasConflict,
} from "@/lib/entity-registry";

/**
 * GET /api/entities/[id]
 *
 * Fetch a single entity by its prefixed ID (e.g. "persona:uuid").
 * Includes all aliases in the response.
 *
 * @returns { entity: Entity }
 * @throws 401 - If authentication fails
 * @throws 404 - If the entity does not exist or belongs to another user
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const id = extractId(request);
  const db = getDb();

  const entity = getEntity(db, id);
  if (!entity || entity.userId !== userId) {
    return notFoundError("Entity");
  }

  return NextResponse.json({ entity });
});

/**
 * PUT /api/entities/[id]
 *
 * Update an entity's display_name and/or add aliases.
 *
 * Body (all fields optional):
 * ```json
 * {
 *   "displayName": "Aragorn II",
 *   "aliases": ["Strider", "Elessar", "King Elessar"]
 * }
 * ```
 *
 * Notes:
 *  - `displayName` replaces the current display name entirely.
 *  - `aliases` are **appended** to the existing alias list (not replaced).
 *  - If any alias already exists (in any entity's alias list), a 409 Conflict
 *    is returned and no aliases are added.
 *
 * @returns { entity: Entity }
 * @throws 400 - If displayName is too long
 * @throws 401 - If authentication fails
 * @throws 404 - If the entity does not exist or belongs to another user
 * @throws 409 - If any alias conflicts with an existing alias
 */
export const PUT = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const id = extractId(request);
  const db = getDb();

  // Verify ownership
  const existing = getEntity(db, id);
  if (!existing || existing.userId !== userId) {
    return notFoundError("Entity");
  }

  requireJson(request);
  const body = await request.json();
  const { displayName, aliases, description } = body;

  // ── Update display name ───────────────────────────────────────────────
  if (displayName !== undefined) {
    const nameErr = validateLength(displayName, 200, "displayName");
    if (nameErr) return badRequestError(nameErr);

    db.prepare(
      "UPDATE entity_registry SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(displayName.trim(), id);
  }

  // ── Update description ────────────────────────────────────────────────
  if (description !== undefined) {
    if (typeof description !== "string") {
      return badRequestError("description must be a string");
    }
    const descErr = validateLength(description, 5000, "description");
    if (descErr) return badRequestError(descErr);

    db.prepare(
      "UPDATE entity_registry SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(description.trim(), id);
  }

  // ── Add aliases ───────────────────────────────────────────────────────
  if (aliases && Array.isArray(aliases) && aliases.length > 0) {
    const conflict = findAliasConflict(db, aliases);
    if (conflict) {
      return NextResponse.json(
        {
          error: `Alias "${conflict}" already exists`,
          conflictAlias: conflict,
        },
        { status: 409 }
      );
    }

    for (const alias of aliases) {
      const trimmed = alias.trim();
      if (trimmed) {
        addAlias(db, id, trimmed);
      }
    }
  }

  const entity = getEntity(db, id)!;
  return NextResponse.json({ entity });
});

/**
 * DELETE /api/entities/[id]
 *
 * Delete an entity and all its aliases (ON DELETE CASCADE on entity_aliases).
 *
 * @returns { success: true }
 * @throws 401 - If authentication fails
 * @throws 404 - If the entity does not exist or belongs to another user
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const id = extractId(request);
  const db = getDb();

  // Verify existence and ownership
  const existing = getEntity(db, id);
  if (!existing || existing.userId !== userId) {
    return notFoundError("Entity");
  }

  db.prepare("DELETE FROM entity_registry WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the `id` path parameter from the request URL.
 * Expected format: Next.js dynamic route param at /api/entities/[id]
 */
function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // segments = ["api", "entities", "<id>"]
  return segments[segments.length - 1];
}
