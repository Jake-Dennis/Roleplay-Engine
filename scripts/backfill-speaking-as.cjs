/**
 * Backfill speaking_as for older AI messages.
 * Run once: node scripts/backfill-speaking-as.cjs
 */
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "global.db");
const db = new Database(dbPath);

console.log("Backfilling speaking_as for old messages...");

// Get all known NPCs per user
const npcRows = db.prepare(
  "SELECT DISTINCT user_id, name FROM npcs WHERE name IS NOT NULL AND name != ''"
).all();

var npcByUser = {};
for (var i = 0; i < npcRows.length; i++) {
  var npc = npcRows[i];
  if (!npcByUser[npc.user_id]) npcByUser[npc.user_id] = [];
  npcByUser[npc.user_id].push({ lower: npc.name.toLowerCase(), original: npc.name });
}

// Get AI messages without speaking_as
const messages = db.prepare(
  "SELECT m.id, m.content, s.owner_id as user_id " +
  "FROM messages m " +
  "JOIN sessions s ON s.id = m.session_id " +
  "WHERE m.sender_id IS NULL " +
  "AND m.content IS NOT NULL AND m.content != '' " +
  "AND (m.speaking_as IS NULL OR m.speaking_as = '') " +
  "ORDER BY m.timestamp ASC"
).all();

console.log("Found " + messages.length + " messages to process...");

var patterns = [
  " said", " replied", " answered", " asked", " murmured",
  " whispered", " called", " shouted", " growled", " spoke",
  " began", " continued", " nodded", " stepped", " turned",
  " smiled", " frowned", " laughed",
  " gives", " looks", " gestures", " leans", " strokes", " sighs",
  " shrugs", " chuckles", " grins", " pauses", " glances", " reaches",
];

var updateStmt = db.prepare("UPDATE messages SET speaking_as = ? WHERE id = ?");
var updated = 0;

for (var m = 0; m < messages.length; m++) {
  var msg = messages[m];
  var userNpcs = npcByUser[msg.user_id] || [];
  if (userNpcs.length === 0) continue;

  var body = msg.content.toLowerCase().replace(/\[\[|\]\]/g, '');
  var found = [];

  for (var n = 0; n < userNpcs.length; n++) {
    var npc = userNpcs[n];
    // Check if NPC name starts the response (with or without wikilinks)
    if (body.indexOf(npc.lower) === 0) {
      if (found.indexOf(npc.original) === -1) found.push(npc.original);
      continue;
    }
    for (var p = 0; p < patterns.length; p++) {
      if (body.indexOf(npc.lower + patterns[p]) !== -1) {
        if (found.indexOf(npc.original) === -1) found.push(npc.original);
        break;
      }
    }
  }

  if (found.length > 0) {
    updateStmt.run(found.join(", "), msg.id);
    updated++;
  }
}

console.log("Done: " + updated + " messages updated");
db.close();
