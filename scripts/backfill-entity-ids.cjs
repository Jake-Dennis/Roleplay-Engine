const D = require('better-sqlite3');
const crypto = require('crypto');
const db = new D('./data/global.db');

console.log('Backfilling entity_id for personas and NPCs...');

// Backfill personas — find or create entity_registry entries
const personas = db.prepare("SELECT id, name, user_id FROM personas").all();
let pCount = 0;
for (const p of personas) {
  const entityId = 'persona:' + p.id;
  try {
    db.prepare("INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id) VALUES (?, 'persona', ?, ?)").run(entityId, p.name, p.user_id);
    db.prepare("INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'user_defined')").run(crypto.randomUUID(), entityId, p.name);
    db.prepare("UPDATE personas SET entity_id = ? WHERE id = ?").run(entityId, p.id);
    pCount++;
  } catch (e) { console.log('  skip', p.id, e.message); }
}

// Backfill NPCs
const npcs = db.prepare("SELECT id, name, user_id, universe_id FROM npcs").all();
let nCount = 0;
for (const n of npcs) {
  const entityId = 'npc:' + n.id;
  try {
    db.prepare("INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, 'npc', ?, ?, ?)").run(entityId, n.name, n.user_id, n.universe_id || null);
    db.prepare("INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'user_defined')").run(crypto.randomUUID(), entityId, n.name);
    db.prepare("UPDATE npcs SET entity_id = ? WHERE id = ?").run(entityId, n.id);
    nCount++;
  } catch (e) { console.log('  skip', n.id, e.message); }
}

console.log('Done: ' + pCount + ' personas, ' + nCount + ' NPCs updated');
db.close();
