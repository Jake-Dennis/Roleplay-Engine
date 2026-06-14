import { withErrorHandler } from "@/lib/with-error-handler";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { badRequestError, notFoundError, requireJson } from "@/lib/error-response";
import { getEntity } from "@/lib/entity-registry";
import { queueJob, processJobsByType } from "@/lib/job-processor";

/**
 * PUT /api/entities/merge
 *
 * Merge duplicate entities. All aliases, relationships, wiki references,
 * entity mentions, and embedding references from the source entity are
 * moved to the target entity, then the source entity is deleted.
 *
 * Body:
 * ```json
 * { "sourceId": "npc:uuid", "targetId": "npc:uuid" }
 * ```
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
  let aliases: { id: string; alias: string; source: string }[] = [];
  let mentionsUpdated = 0;
  let embeddingsUpdated = 0;

  const transaction = db.transaction(() => {
    // 1. Move all aliases from source to target
    aliases = db
      .prepare("SELECT id, alias, source FROM entity_aliases WHERE entity_id = ?")
      .all(sourceId) as { id: string; alias: string; source: string }[];

    for (const a of aliases) {
      try {
        db.prepare(
          "INSERT INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, ?)"
        ).run(crypto.randomUUID(), targetId, a.alias, a.source);
      } catch { /* duplicate — skip */ }
    }

    // 2. Update relationships to point to target entity
    db.prepare("UPDATE relationships SET source_entity_id = ? WHERE source_entity_id = ?").run(targetId, sourceId);
    db.prepare("UPDATE relationships SET target_entity_id = ? WHERE target_entity_id = ?").run(targetId, sourceId);

    // 3. Update entity_mentions to point to target
    const mentionResult = db.prepare("UPDATE entity_mentions SET entity_id = ? WHERE entity_id = ?").run(targetId, sourceId);
    mentionsUpdated = mentionResult.changes;

    // 4. Update embedding_index references
    const embedResult = db.prepare("UPDATE embedding_index SET entity_id = ? WHERE entity_id = ?").run(targetId, sourceId);
    embeddingsUpdated = embedResult.changes;

    // 5. Delete source entity (cascades to entity_aliases via FK)
    db.prepare("DELETE FROM entity_registry WHERE id = ?").run(sourceId);
  });

  transaction();

  // Queue and immediately process the wiki update job
  queueJob(userId, "update_entity_references", {
    sourceId,
    targetId,
    userId,
  }, "low");
  try {
    await processJobsByType(userId, "update_entity_references", 1);
  } catch { /* non-fatal — falls back to idle processing */ }

  return NextResponse.json({
    success: true,
    mergedInto: targetId,
    stats: {
      aliasesMoved: aliases.length,
      relationshipsUpdated: true,
      mentionsUpdated,
      embeddingsUpdated,
      wikiJobQueued: true,
    },
  });
});
