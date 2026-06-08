// Quick state check
const Database = require("better-sqlite3");
const db = new Database("data/global.db");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log("=== TABLES WITH DATA ===");
for (const t of tables) {
  try {
    const c = db.prepare("SELECT COUNT(*) as cnt FROM \"" + t.name + "\"").get().cnt;
    if (c > 0) console.log("  " + t.name + ": " + c + " rows");
  } catch(e) {}
}
const users = db.prepare("SELECT id, username FROM users").all();
console.log("\nUsers in DB: " + users.length);
users.forEach(u => console.log("  " + u.username + " (" + u.id.slice(0,8) + "...)"));
const sessions = db.prepare("SELECT id, name FROM sessions").all();
console.log("Sessions in DB: " + sessions.length);
const universes = db.prepare("SELECT id, name FROM universes").all();
console.log("Universes in DB: " + universes.length);
universes.forEach(u => console.log("  " + u.name + " (" + u.id.slice(0,8) + "...)"));
db.close();
