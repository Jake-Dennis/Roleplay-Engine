const Database = require('better-sqlite3');
const crypto = require('crypto');
const db = new Database('./data/global.db');

console.log('Backfilling entity registry...');

// Backfill personas
const personas = db.prepare("SELECT id, name, user_id FROM personas").all();
let count = 0;
for (const p of personas) {
  const entityId = `persona:${p.id}`;
  try {
    db.prepare(
      "INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id) VALUES (?, 'persona', ?, ?)"
    ).run(entityId, p.name, p.user_id);
    db.prepare(
      "INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'user_defined')"
    ).run(crypto.randomUUID(), entityId, p.name);
    count++;
  } catch (e) { console.log('  skip persona', p.id, e.message); }
}

// Backfill NPCs
const npcs = db.prepare("SELECT id, name, user_id, universe_id FROM npcs").all();
for (const n of npcs) {
  const entityId = `npc:${n.id}`;
  try {
    db.prepare(
      "INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, 'npc', ?, ?, ?)"
    ).run(entityId, n.name, n.user_id, n.universe_id || null);
    db.prepare(
      "INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'user_defined')"
    ).run(crypto.randomUUID(), entityId, n.name);
    count++;
  } catch (e) { console.log('  skip npc', n.id, e.message); }
}

// Backfill locations
const locations = db.prepare("SELECT id, name, user_id, universe_id FROM locations").all();
for (const l of locations) {
  const entityId = `location:${l.id}`;
  try {
    db.prepare(
      "INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, 'location', ?, ?, ?)"
    ).run(entityId, l.name, l.user_id, l.universe_id || null);
    db.prepare(
      "INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'user_defined')"
    ).run(crypto.randomUUID(), entityId, l.name);
    count++;
  } catch (e) { console.log('  skip location', l.id, e.message); }
}

// Backfill events
const events = db.prepare("SELECT id, title, user_id, universe_id FROM events").all();
for (const e of events) {
  const entityId = `event:${e.id}`;
  try {
    db.prepare(
      "INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, 'event', ?, ?, ?)"
    ).run(entityId, e.title, e.user_id, e.universe_id || null);
    db.prepare(
      "INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'user_defined')"
    ).run(crypto.randomUUID(), entityId, e.title);
    count++;
  } catch (e) { console.log('  skip event', e.id, e.message); }
}

console.log(`Done: ${count} entities registered`);
db.close();
