const Database = require("better-sqlite3");
const db = new Database("data/global.db");
db.pragma("foreign_keys = OFF");

const users = db.prepare("SELECT id, username FROM users").all();
const groups = db.prepare("SELECT id, name FROM groups").all();

console.log("--- Before ---");
console.log("Users:", users.length);
users.forEach(u => console.log("  " + u.username + " (" + u.id.slice(0,8) + "...)"));
console.log("Groups:", groups.length);
groups.forEach(g => console.log("  " + g.name));

const tables = [
  "group_members", "message_edits", "message_reactions",
  "token_denylist", "groups", "users"
];
for (const t of tables) {
  try {
    const r = db.prepare("DELETE FROM " + t).run();
    if (r.changes > 0) console.log(t + ": " + r.changes + " deleted");
  } catch(e) {}
}

db.pragma("foreign_keys = ON");
console.log("\nUsers left:", db.prepare("SELECT COUNT(*) as c FROM users").get().c);
console.log("Groups left:", db.prepare("SELECT COUNT(*) as c FROM groups").get().c);
db.close();
