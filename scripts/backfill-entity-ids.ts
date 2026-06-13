/**
 * Backfill Entity ID Columns
 *
 * Processes existing scene_states, session_participants, and narrative_threads
 * to populate the new entity-linked columns (active_npc_ids, entity_id, entity_ids)
 * from the old plain-text name columns.
 *
 * Safe to run multiple times — skips rows where the new column is already set.
 *
 * Usage: npx tsx scripts/backfill-entity-ids.ts
 */

import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const dbPath = path.join(DATA_DIR, "global.db");

interface EntityRow {
  id: string;
  entity_type: string;
  display_name: string;
  user_id: string;
}

function main() {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  console.log("=== Backfilling Entity ID Columns ===\n");

  // -------------------------------------------------------------------------
  // 1. Scene states — backfill active_npc_ids
  // -------------------------------------------------------------------------
  console.log("1. Backfilling scene_states.active_npc_ids...");
  const sceneStates = db.prepare(`
    SELECT id, session_id, active_npcs, active_npc_ids
    FROM scene_states
    WHERE active_npcs IS NOT NULL AND active_npcs != ''
      AND (active_npc_ids IS NULL OR active_npc_ids = '')
  `).all() as { id: string; session_id: string; active_npcs: string; active_npc_ids: string | null }[];

  let sceneCount = 0;
  for (const row of sceneStates) {
    let npcNames: string[] = [];
    try {
      const parsed = JSON.parse(row.active_npcs);
      if (Array.isArray(parsed)) npcNames = parsed.map(String);
    } catch {
      // Fallback: comma-separated
      npcNames = row.active_npcs.split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    if (npcNames.length === 0) continue;

    const npcIds: string[] = [];
    for (const name of npcNames) {
      // Try to find the user_id of this session's owner
      const sessionOwner = db.prepare(
        "SELECT owner_id FROM sessions WHERE id = ?"
      ).get(row.session_id) as { owner_id: string } | undefined;

      if (sessionOwner) {
        const found = db.prepare(
          "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ? AND entity_type = 'npc' LIMIT 1"
        ).get(name, sessionOwner.owner_id) as { id: string } | undefined;
        npcIds.push(found?.id || name);
      } else {
        npcIds.push(name);
      }
    }

    db.prepare("UPDATE scene_states SET active_npc_ids = ? WHERE id = ?").run(
      JSON.stringify(npcIds),
      row.id
    );
    sceneCount++;
  }
  console.log(`   Updated ${sceneCount} scene state(s).`);

  // -------------------------------------------------------------------------
  // 2. Session participants — backfill entity_id
  // -------------------------------------------------------------------------
  console.log("2. Backfilling session_participants.entity_id...");
  const participants = db.prepare(`
    SELECT sp.session_id, sp.user_id, sp.character_name, sp.entity_id
    FROM session_participants sp
    WHERE sp.character_name IS NOT NULL AND sp.character_name != ''
      AND (sp.entity_id IS NULL OR sp.entity_id = '')
  `).all() as { session_id: string; user_id: string; character_name: string; entity_id: string | null }[];

  let participantCount = 0;
  for (const p of participants) {
    // Try to find existing entity
    const existing = db.prepare(
      "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ? AND entity_type = 'npc' LIMIT 1"
    ).get(p.character_name, p.user_id) as { id: string } | undefined;

    let entityId: string | null;
    if (existing) {
      entityId = existing.id;
    } else {
      // Create new entity
      entityId = `npc:${crypto.randomUUID()}`;
      try {
        db.prepare(
          "INSERT INTO entity_registry (id, entity_type, display_name, user_id) VALUES (?, 'npc', ?, ?)"
        ).run(entityId, p.character_name, p.user_id);
      } catch {
        entityId = null;
      }
    }

    if (entityId) {
      db.prepare(
        "UPDATE session_participants SET entity_id = ? WHERE session_id = ? AND user_id = ?"
      ).run(entityId, p.session_id, p.user_id);
      participantCount++;
    }
  }
  console.log(`   Updated ${participantCount} participant(s).`);

  // -------------------------------------------------------------------------
  // 3. Narrative threads — backfill entity_ids
  // -------------------------------------------------------------------------
  console.log("3. Backfilling narrative_threads.entity_ids...");
  const threads = db.prepare(`
    SELECT id, user_id, key_entities, entity_ids
    FROM narrative_threads
    WHERE key_entities IS NOT NULL AND key_entities != ''
      AND (entity_ids IS NULL OR entity_ids = '')
  `).all() as { id: string; user_id: string; key_entities: string; entity_ids: string | null }[];

  let threadCount = 0;
  for (const t of threads) {
    let entityNames: string[] = [];
    try {
      const parsed = JSON.parse(t.key_entities);
      if (Array.isArray(parsed)) entityNames = parsed.map(String);
    } catch {
      entityNames = t.key_entities.split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    if (entityNames.length === 0) continue;

    const entityIds: string[] = [];
    for (const name of entityNames) {
      const found = db.prepare(
        "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ? LIMIT 1"
      ).get(name, t.user_id) as { id: string } | undefined;
      entityIds.push(found?.id || name);
    }

    db.prepare("UPDATE narrative_threads SET entity_ids = ? WHERE id = ?").run(
      JSON.stringify(entityIds),
      t.id
    );
    threadCount++;
  }
  console.log(`   Updated ${threadCount} narrative thread(s).`);

  console.log("\n=== Backfill complete ===");
  db.close();
}

main();
