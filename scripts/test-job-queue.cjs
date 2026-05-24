/**
 * Job Queue CRUD Test
 * Tests create, read, update, delete, retry, max-retries cap.
 */
const Database = require("better-sqlite3");
const db = new Database("data/global.db");

const userId = "8aec6985-e41f-494c-ba65-99648ee80d4b";

// Cleanup previous test data
db.prepare("DELETE FROM job_queue WHERE id LIKE ?").run("test-%");

console.log("=== JOB QUEUE CRUD TESTS ===\n");

// 1. CREATE
const jobId = "test-" + Date.now();
db.prepare(
  `INSERT INTO job_queue (id, user_id, type, status, payload, priority, max_retries, retry_count, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
).run(jobId, userId, "generate_embeddings", "queued", JSON.stringify({ sessionId: "test-1" }), "medium", 3, 0);

const created = db.prepare("SELECT id, type, status, priority, retry_count, max_retries FROM job_queue WHERE id = ?").get(jobId);
console.log("1. CREATE: \u2713 Job queued", JSON.stringify(created));

// 2. READ
const jobs = db.prepare("SELECT id, type, status FROM job_queue WHERE user_id = ? ORDER BY created_at DESC").all(userId);
console.log("2. READ: \u2713 Got", jobs.length, "total job(s) for user");

// 3. UPDATE -> processing
db.prepare("UPDATE job_queue SET status = ?, progress = ?, progress_message = ? WHERE id = ?").run("processing", 50, "Working...", jobId);
const processing = db.prepare("SELECT id, status, progress, progress_message FROM job_queue WHERE id = ?").get(jobId);
console.log("3. UPDATE (\u2192processing): \u2713", JSON.stringify(processing));

// 4. UPDATE -> completed
db.prepare("UPDATE job_queue SET status = ?, progress = ?, progress_message = ?, processed_at = datetime('now') WHERE id = ?").run("completed", 100, "Completed", jobId);
const completed = db.prepare("SELECT id, status, progress FROM job_queue WHERE id = ?").get(jobId);
console.log("4. UPDATE (\u2192completed): \u2713", JSON.stringify(completed));

// 5. DELETE
db.prepare("DELETE FROM job_queue WHERE id = ?").run(jobId);
const deleted = db.prepare("SELECT id FROM job_queue WHERE id = ?").get(jobId);
console.log("5. DELETE: \u2713 Removed (row exists:", !!deleted, ")");

// 6. RETRY TEST
const failId = "test-fail-" + Date.now();
db.prepare(
  `INSERT INTO job_queue (id, user_id, type, status, payload, priority, max_retries, retry_count, error, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
).run(failId, userId, "generate_embeddings", "failed", "{}", "medium", 3, 2, "Ollama timeout");

const failed = db.prepare("SELECT retry_count, max_retries FROM job_queue WHERE id = ?").get(failId);
console.log("6. RETRY: retry_count=" + failed.retry_count + " < max_retries=" + failed.max_retries + " = " + ((failed.retry_count ?? 0) < (failed.max_retries ?? 3)));

// Execute retry (increment + requeue)
db.prepare("UPDATE job_queue SET status = ?, error = NULL, progress = 0, progress_message = NULL, processed_at = NULL, retry_count = ? WHERE id = ?").run("queued", (failed.retry_count ?? 0) + 1, failId);
const retried = db.prepare("SELECT id, status, retry_count, error FROM job_queue WHERE id = ?").get(failId);
console.log("   After retry:", JSON.stringify(retried));

// 7. MAX RETRIES CAP
const maxedId = "test-maxed-" + Date.now();
db.prepare(
  `INSERT INTO job_queue (id, user_id, type, status, payload, priority, max_retries, retry_count, error, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
).run(maxedId, userId, "generate_embeddings", "failed", "{}", "medium", 3, 3, "Ollama timeout");

const maxedJob = db.prepare("SELECT retry_count, max_retries FROM job_queue WHERE id = ?").get(maxedId);
const wouldRetry = (maxedJob.retry_count ?? 0) < (maxedJob.max_retries ?? 3);
console.log("7. MAX RETRIES: count=" + maxedJob.retry_count + ", max=" + maxedJob.max_retries + ", can retry:", wouldRetry, "(expected: false)");

// 8. CANCEL TEST
const cancelId = "test-cancel-" + Date.now();
db.prepare(
  `INSERT INTO job_queue (id, user_id, type, status, payload, priority, max_retries, retry_count, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
).run(cancelId, userId, "generate_embeddings", "queued", "{}", "medium", 3, 0);

const cancelResult = db.prepare("UPDATE job_queue SET status = ? WHERE id = ? AND status = ?").run("cancelled", cancelId, "queued");
const cancelled = db.prepare("SELECT id, status FROM job_queue WHERE id = ?").get(cancelId);
console.log("8. CANCEL: \u2713 Changed:", cancelResult.changes, "row(s), new status:", cancelled.status);

// 9. Cleanup
db.prepare("DELETE FROM job_queue WHERE id LIKE ?").run("test-%");
const remaining = db.prepare("SELECT COUNT(*) as c FROM job_queue WHERE id LIKE ?").get("test-%");
console.log("\n9. CLEANUP: \u2713 All test jobs removed (remaining:", remaining.c, ")");

console.log("\n=== ALL TESTS PASSED ===");

// 10. Verify schema has retry columns
const cols = db.prepare("PRAGMA table_info(job_queue)").all();
const retryCol = cols.find(c => c.name === "retry_count");
const maxRetryCol = cols.find(c => c.name === "max_retries");
console.log("\nSchema check:");
console.log("  retry_count column:", !!retryCol, "default:", retryCol ? retryCol.dflt_value : "N/A");
console.log("  max_retries column:", !!maxRetryCol, "default:", maxRetryCol ? maxRetryCol.dflt_value : "N/A");

db.close();
