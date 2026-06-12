import { withErrorHandler } from "@/lib/with-error-handler";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { badRequestError, notFoundError, requireJson } from "@/lib/error-response";
import { getEntity } from "@/lib/entity-registry";

/**
 * PUT /api/entities/merge
 *
 * Merge duplicate entities. All aliases, relationships, and references
 * from the source entity are moved to the target entity, then the
 * source entity is deleted.
 *
 * Body:
 * ```json
 * {
 *   "sourceId": "npc:uuid",
 *   "targetId": "npc:uuid"
 * }
 * ```
 *
 * @returns { success: true, mergedInto: string }
 * @throws 400 - If sourceId or targetId is missing, or if they are the same
 * @throws 404 - If either entity does not exist or belongs to another user
 * @throws 401 - If authentication fails
 */
export const PUT = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  requireJson(request);
  const body = await request.json();
  const { sourceId, targetId } = body;

  if (!sourceId || !targetId) {
    return badRequestError("sourceId and targetId are required");
  }

  if (sourceId === targetId) {
    return badRequestError("Cannot merge an entity with itself");
  }

  const db = getDb();

  // Verify both entities exist and belong to the user
  const source = getEntity(db, sourceId);
  const target = getEntity(db, targetId);

  if (!source || source.userId !== userId) {
    return notFoundError("Source entity");
  }
  if (!target || target.userId !== userId) {
    return notFoundError("Target entity");
  }

  // Perform the merge in a transaction
  const transaction = db.transaction(() => {
    // 1. Move all aliases from source to target (skip duplicates via UNIQUE constraint)
    const aliases = db
      .prepare("SELECT id, alias, source FROM entity_aliases WHERE entity_id = ?")
      .all(sourceId) as { id: string; alias: string; source: string }[];

    for (const a of aliases) {
      try {
        db.prepare(
          "INSERT INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, ?)"
        ).run(crypto.randomUUID(), targetId, a.alias, a.source);
      } catch {
        // UNIQUE constraint violation — skip duplicate alias silently
      }
    }

    // 2. Update relationships to point to target entity
    db.prepare("UPDATE relationships SET source_entity_id = ? WHERE source_entity_id = ?").run(
      targetId,
      sourceId
    );
    db.prepare("UPDATE relationships SET target_entity_id = ? WHERE target_entity_id = ?").run(
      targetId,
      sourceId
    );

    // 3. Delete source entity (cascades to entity_aliases via ON DELETE CASCADE)
    db.prepare("DELETE FROM entity_registry WHERE id = ?").run(sourceId);
  });

  transaction();

  return NextResponse.json({ success: true, mergedInto: targetId });
});
