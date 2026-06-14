const Database = require('better-sqlite3');
const db = new Database('data/global.db');
const cols = db.prepare("PRAGMA table_info(personas)").all();
console.log('personas columns:');
for (const c of cols) {
  console.log('  ' + c.name + ' (' + c.type + ', nullable=' + (c.notnull === 0 ? 'yes' : 'no') + ')');
}
db.close();
