import Database from 'better-sqlite3';
import { readdirSync } from 'fs';
import { join } from 'path';

const dataDir = 'C:/Users/JakeP/Documents/GitHub/Roleplay-Engine/data';
const files = readdirSync(dataDir).filter(f => f.endsWith('.db'));

for (const f of files) {
  try {
    const db = new Database(join(dataDir, f));
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (row) {
      console.log(`${f}: HAS users table`);
      const users = db.prepare('SELECT id, username, created_at FROM users').all();
      console.log(`  ${users.length} users:`);
      for (const u of users) {
        console.log(`    - ${u.username} (${u.id.substring(0,8)}...) created ${u.created_at}`);
      }
    }
    db.close();
  } catch(e) {
    console.log(`${f}: ${e.message.substring(0,60)}`);
  }
}
