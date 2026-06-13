const D = require('better-sqlite3');
const db = new D('./data/global.db');
let c = 0;

// Backfill scene_states.active_npc_ids
const scenes = db.prepare("SELECT session_id, active_npcs FROM scene_states WHERE active_npcs IS NOT NULL").all();
for (const s of scenes) {
  if (!s.active_npcs) continue;
  const names = s.active_npcs.split(',').map(n => n.trim()).filter(Boolean);
  const ids = names.map(n => {
    const f = db.prepare("SELECT id FROM entity_registry WHERE display_name = ? AND entity_type = 'npc' LIMIT 1").get(n);
    return f ? f.id : n;
  });
  db.prepare("UPDATE scene_states SET active_npc_ids = ? WHERE session_id = ?").run(JSON.stringify(ids), s.session_id);
  c++;
}
console.log('Scene states: ' + c + ' updated');

// Backfill session_participants.entity_id
const participants = db.prepare("SELECT session_id, user_id, character_name FROM session_participants WHERE character_name IS NOT NULL").all();
c = 0;
for (const p of participants) {
  const entityId = 'npc:' + require('crypto').randomUUID();
  try {
    db.prepare("INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id) VALUES (?, 'npc', ?, ?)").run(entityId, p.character_name, p.user_id);
    db.prepare("UPDATE session_participants SET entity_id = ? WHERE session_id = ? AND user_id = ?").run(entityId, p.session_id, p.user_id);
    c++;
  } catch (e) { console.log('  skip', p.character_name, e.message); }
}
console.log('Participants: ' + c + ' updated');

// Backfill narrative_threads.entity_ids
const threads = db.prepare("SELECT id, key_entities FROM narrative_threads WHERE key_entities IS NOT NULL").all();
c = 0;
for (const t of threads) {
  let names = [];
  try { names = JSON.parse(t.key_entities); } catch { names = [t.key_entities]; }
  if (!Array.isArray(names)) names = [names];
  const ids = names.map(n => {
    const f = db.prepare("SELECT id FROM entity_registry WHERE display_name = ? LIMIT 1").get(n);
    return f ? f.id : n;
  });
  db.prepare("UPDATE narrative_threads SET entity_ids = ? WHERE id = ?").run(JSON.stringify(ids), t.id);
  c++;
}
console.log('Threads: ' + c + ' updated');

db.close();
