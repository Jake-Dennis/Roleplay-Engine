import { withErrorHandler } from "@/lib/with-error-handler";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { badRequestError, notFoundError, requireJson } from "@/lib/error-response";
import { getEntity } from "@/lib/entity-registry";
import fs from "fs";
import path from "path";
import { APP_CONFIG } from "@/lib/config";

/**
 * Update entity_id in a wiki page's frontmatter by rewriting the file.
 */
function updateWikiFrontmatter(filePath: string, oldId: string, newId: string): boolean {
  try {
    let content = fs.readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fmMatch) return false;
    
    const fm = fmMatch[1];
    if (!fm.includes(oldId)) return false;
    
    const updated = fm.replace(
      new RegExp(`entity_id:\\s*${escapeRegex(oldId)}`, "g"),
      `entity_id: ${newId}`
    );
    if (updated === fm) return false;
    
    content = content.replace(fmMatch[1], updated);
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find wiki files that reference a given entity_id by scanning frontmatter.
 * Uses the wiki index or walks the wiki directory.
 */
function findWikiFilesWithEntityId(db: any, userId: string, entityId: string): string[] {
  const results: string[] = [];
  const wikiRoot = path.join(APP_CONFIG.dataDir, userId, "wiki");
  if (!fs.existsSync(wikiRoot)) return results;

  const walkDir = (dir: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walkDir(fullPath);
        else if (entry.name.endsWith(".md")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes(entityId)) results.push(fullPath);
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip */ }
  };
  walkDir(wikiRoot);
  return results;
}

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
  let wikiFilesUpdated = 0;
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

    // 5. Update supplementary table entity_id references (personas / npcs)
    const sourceType = sourceId.split(":")[0];
    if (sourceType === "persona") {
      db.prepare("UPDATE personas SET entity_id = ? WHERE entity_id = ?").run(targetId, sourceId);
    } else if (sourceType === "npc") {
      db.prepare("UPDATE npcs SET entity_id = ? WHERE entity_id = ?").run(targetId, sourceId);
    }

    // 6. Delete source entity (cascades to entity_aliases via FK)
    db.prepare("DELETE FROM entity_registry WHERE id = ?").run(sourceId);
  });

  transaction();

  // 6. Update wiki page frontmatter (outside transaction — file I/O)
  try {
    const wikiFiles = findWikiFilesWithEntityId(db, userId, sourceId);
    for (const filePath of wikiFiles) {
      if (updateWikiFrontmatter(filePath, sourceId, targetId)) {
        wikiFilesUpdated++;
      }
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    success: true,
    mergedInto: targetId,
    stats: {
      aliasesMoved: aliases.length,
      relationshipsUpdated: true,
      mentionsUpdated,
      embeddingsUpdated,
      wikiFilesUpdated,
    },
  });
});
