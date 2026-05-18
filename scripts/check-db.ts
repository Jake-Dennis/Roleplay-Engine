import { getDb } from "../src/lib/db";

const db = getDb();

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
console.log("=== DATABASE TABLES ===");
tables.forEach(t => console.log(`  ${t.name}`));

// Count rows in each table
console.log("\n=== ROW COUNTS ===");
tables.forEach(t => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number };
  console.log(`  ${t.name}: ${count.c} rows`);
});

// Show user data sample
console.log("\n=== USERS (sample) ===");
const users = db.prepare("SELECT id, username, created_at FROM users LIMIT 5").all();
console.log(JSON.stringify(users, null, 2));

// Show sessions sample
console.log("\n=== SESSIONS (sample) ===");
const sessions = db.prepare("SELECT id, owner_id, name, type, status, created_at FROM sessions LIMIT 5").all();
console.log(JSON.stringify(sessions, null, 2));

// Show messages sample
console.log("\n=== MESSAGES (sample) ===");
const messages = db.prepare("SELECT id, session_id, content, timestamp FROM messages LIMIT 3").all();
console.log(JSON.stringify(messages, null, 2));
