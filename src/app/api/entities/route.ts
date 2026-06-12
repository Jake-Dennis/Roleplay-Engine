import { withErrorHandler } from "@/lib/with-error-handler";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { requireJson, badRequestError, notFoundError } from "@/lib/error-response";
import { validateLength } from "@/lib/validation";
import {
  validateEntityType,
  findAliasConflict,
  registerEntity,
  listEntities,
  resolveEntity,
} from "@/lib/entity-registry";

/**
 * GET /api/entities
 *
 * List entities for the authenticated user, with optional filtering.
 *
 * Query params (all optional):
 *   - type         — filter by entity_type (persona, npc, user, location, event)
 *   - universe_id  — filter by universe
 *   - search       — search by display_name or alias (case-insensitive)
 *   - ids          — comma-separated list of entity IDs to fetch
 *   - name         — if present, switches to **resolve mode** (looks up a single
 *                    entity by display name or alias, see resolve query param docs)
 *   - universe_id  — (in resolve mode) scope the resolution to a specific universe
 *
 * Resolve mode (when `name` query param is provided):
 *   Looks up the entity by display_name or alias in entity_aliases first,
 *   then entity_registry.display_name. Returns the matching entity or 404.
 *
 * @returns { entities: Entity[] } or { entity: Entity }
 * @throws 401 - If authentication fails
 * @throws 404 - In resolve mode, if no entity matches the given name
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const db = getDb();

  // ── Resolve mode ──────────────────────────────────────────────────────
  const name = searchParams.get("name");
  if (name) {
    const universeId = searchParams.get("universe_id") || undefined;

    const entity = resolveEntity(db, name, universeId);
    if (!entity || entity.userId !== userId) {
      return notFoundError("Entity");
    }

    return NextResponse.json({ entity });
  }

  // ── List mode ─────────────────────────────────────────────────────────
  const type = searchParams.get("type");
  const universeId = searchParams.get("universe_id");
  const search = searchParams.get("search");
  const idsParam = searchParams.get("ids");

  // Validate type filter if provided
  if (type) {
    const typeErr = validateEntityType(type);
    if (typeErr) return badRequestError(typeErr);
  }

  const ids = idsParam
    ? idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const entities = listEntities(db, userId, {
    type: type || undefined,
    universeId: universeId || undefined,
    search: search || undefined,
    ids,
  });

  return NextResponse.json({ entities });
});

/**
 * POST /api/entities
 *
 * Register a new entity (with optional aliases).
 *
 * Body:
 * ```json
 * {
 *   "entityType": "npc",
 *   "displayName": "Elrond",
 *   "universeId": "uuid",
 *   "aliases": ["Elrond Half-elven", "Lord of Rivendell"]
 * }
 * ```
 *
 * @returns { entity: Entity } (201)
 * @throws 400 - If entityType or displayName is missing or invalid
 * @throws 409 - If any alias already exists in the system
 * @throws 401 - If authentication fails
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  requireJson(request);
  const body = await request.json();
  const { entityType, displayName, universeId, aliases } = body;

  // ── Validation ────────────────────────────────────────────────────────
  if (!entityType || !displayName) {
    return badRequestError("entityType and displayName are required");
  }

  const typeErr = validateEntityType(entityType);
  if (typeErr) return badRequestError(typeErr);

  const nameErr = validateLength(displayName, 200, "displayName");
  if (nameErr) return badRequestError(nameErr);

  // ── Check alias conflicts ─────────────────────────────────────────────
  if (aliases && Array.isArray(aliases) && aliases.length > 0) {
    const conflict = findAliasConflict(getDb(), aliases);
    if (conflict) {
      return NextResponse.json(
        {
          error: `Alias "${conflict}" already exists`,
          conflictAlias: conflict,
        },
        { status: 409 }
      );
    }
  }

  // ── Register ──────────────────────────────────────────────────────────
  const entity = registerEntity(
    getDb(),
    userId,
    entityType,
    displayName,
    universeId || undefined,
    aliases
  );

  return NextResponse.json({ entity }, { status: 201 });
});
