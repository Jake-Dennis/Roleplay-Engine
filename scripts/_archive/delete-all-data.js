// Delete all sessions, universes, and QA test data
// Keeps the real user "jake" (a750ee1c)

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const db = new Database("data/global.db");

const REAL_USER = "a750ee1c";

console.log("=== COLLECTING DATA TO DELETE ===\n");

// Get all users except real user
const qaUsers = db.prepare("SELECT id, username FROM users WHERE id != ?").all(REAL_USER);
console.log("QA users to delete:", qaUsers.length);
qaUsers.forEach((u) => console.log("  " + u.username + " (" + u.id + ")"));

// Get all universes
const universes = db.prepare("SELECT id, name, user_id FROM universes").all();
console.log("\nUniverses to delete:", universes.length);
universes.forEach((u) => console.log("  " + u.name + " (" + u.id + ") by " + u.user_id));

// Get all sessions
const sessions = db.prepare("SELECT COUNT(*) as c FROM sessions").get();
console.log("\nSessions to delete:", sessions.c);

// Wiki dirs to clean up
console.log("\n=== CLEANING UP WIKI DIRECTORIES ===\n");
const dataDir = "data";
const userDirs = fs.readdirSync(dataDir).filter((d) => {
  const fullPath = path.join(dataDir, d);
  return fs.statSync(fullPath).isDirectory() && d !== ".gitkeep";
});
console.log("Data directories found:", userDirs.length);

// Delete per-user wiki directories (universe subdirectories inside)
for (const userId of userDirs) {
  const wikiDir = path.join(dataDir, userId, "wiki");
  if (fs.existsSync(wikiDir)) {
    const universeDirs = fs.readdirSync(wikiDir).filter((d) => {
      return fs.statSync(path.join(wikiDir, d)).isDirectory();
    });
    for (const uniDir of universeDirs) {
      const uniPath = path.join(wikiDir, uniDir);
      fs.rmSync(uniPath, { recursive: true, force: true });
      console.log("  Deleted wiki: " + userId.slice(0, 8) + "/wiki/" + uniDir);
    }
  }
}

console.log("\n=== DELETING DATABASE RECORDS ===\n");

// Disable foreign keys for cleanup
db.prepare("PRAGMA foreign_keys = OFF").run();

// Delete in dependency-safe order
const deleteOrder = [
  "token_denylist",
  "session_participants",
  "scene_states",
  "session_config",
  "narrative_threads",
  "narrative_memories",
  "messages_fts",
  "messages",
  "timeline_entries",
  "timeline_layers",
  "timelines",
  "events",
  "entity_validations",
  "embedding_index",
  "backlinks",
  "relationships",
  "job_queue",
  "story_arcs",
  "voice_assignments",
  "npcs",
  "personas",
  "wiki_versions",
  "scene_states",
];

let totalDeleted = 0;
for (const table of deleteOrder) {
  try {
    const result = db.prepare("DELETE FROM " + table).run();
    if (result.changes > 0) {
      console.log("  " + table + ": " + result.changes + " rows");
      totalDeleted += result.changes;
    }
  } catch (e) {
    // Table may not exist
  }
}

// Delete sessions
const sResult = db.prepare("DELETE FROM sessions").run();
console.log("  sessions: " + sResult.changes + " rows");
totalDeleted += sResult.changes;

// Delete universes
const uResult = db.prepare("DELETE FROM universes").run();
console.log("  universes: " + uResult.changes + " rows");
totalDeleted += uResult.changes;

// Delete QA test users
for (const u of qaUsers) {
  db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
  console.log("  user: " + u.username);
}

// Re-enable foreign keys
db.prepare("PRAGMA foreign_keys = ON").run();

const remainingUsers = db.prepare("SELECT username FROM users").all();
console.log("\n=== REMAINING USERS ===");
remainingUsers.forEach((u) => console.log("  " + u.username));

db.close();

console.log("\n=== SUMMARY ===");
console.log("Total rows deleted: " + totalDeleted);
console.log("QA users deleted: " + qaUsers.length);
console.log("Done.");
