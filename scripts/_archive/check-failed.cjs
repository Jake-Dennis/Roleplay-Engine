const db = require("better-sqlite3")("data/global.db");
const failed = db.prepare("SELECT id, type, priority, error, created_at, payload FROM job_queue WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20").all();
console.log("=== FAILED JOBS (last 20) ===\n");
for (const j of failed) {
  console.log(j.type + " (" + j.priority + ")");
  console.log("  Error: " + j.error);
  console.log("  Created: " + j.created_at);
  console.log("  Payload: " + (j.payload ? j.payload.substring(0, 200) : "empty"));
  console.log("");
}
console.log("Total failed: " + failed.length);

const counts = db.prepare("SELECT status, COUNT(*) as c FROM job_queue GROUP BY status").all();
console.log("\n=== JOB STATUS COUNTS ===");
for (const r of counts) {
  console.log("  " + r.status + ": " + r.c);
}
db.close();
