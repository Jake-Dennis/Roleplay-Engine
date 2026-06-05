/**
 * Phase 6: Background Jobs - Comprehensive Test Suite
 * 
 * Tests:
 * 1. Job Queue Management
 * 2. Job Processing Engine
 * 3. Message Summarization
 * 4. Embedding Generation
 * 5. Relationship Analysis
 * 6. Lore Expansion
 * 7. Relationship Decay
 * 8. Memory Compression
 * 9. Idle-Time Processing
 * 10. Job API Routes
 * 11. Database Schema
 */

const BASE = "http://localhost:3000";
let passed = 0;
let failed = 0;

function t(name, condition) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`);
  }
}

function title(text) {
  console.log(`\n─── ${text} ───`);
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (opts.token) headers["Cookie"] = `auth-token=${opts.token}`;
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: "manual",
    });
    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) data = await res.json();
    else data = await res.text();
    return { status: res.status, data, cookie: res.headers.get("set-cookie") || "" };
  } catch (e) {
    return { status: 0, data: null, error: e.message };
  }
}

async function main() {
  // ============================================================
  //  SETUP
  // ============================================================
  title("SETUP: Register User & Create Session");

  let r = await req("/api/auth/register", {
    method: "POST",
    body: { username: `p6u_${Date.now().toString(36)}`, password: "Test1234" },
  });
  if (r.status !== 201) console.log(`     DEBUG register: status=${r.status}, data=${JSON.stringify(r.data)}`);
  t("User registration returns 201", r.status === 201);
  const USER_ID = r.data?.user?.id;
  t("User has id", !!USER_ID);

  const username = `p6u_${Date.now().toString(36)}`;
  // Register with a known username
  r = await req("/api/auth/register", {
    method: "POST",
    body: { username, password: "Test1234" },
  });
  if (r.status !== 201) console.log(`     DEBUG register2: status=${r.status}, data=${JSON.stringify(r.data)}`);
  t("User registration returns 201 (second)", r.status === 201);

  r = await req("/api/auth/login", {
    method: "POST",
    body: { username, password: "Test1234" },
  });
  if (r.status !== 200) console.log(`     DEBUG login: status=${r.status}, data=${JSON.stringify(r.data)}`);
  t("User login returns 200", r.status === 200);
  const TOKEN = (r.cookie.match(/auth-token=([^;]+)/) || [])[1];
  t("User got auth token", !!TOKEN);

  // Create universe
  r = await req("/api/universes", {
    method: "POST",
    token: TOKEN,
    body: { name: "Phase 6 Universe", canon_mode: "strict" },
  });
  t("Universe creation returns 201", r.status === 201);
  const UNIVERSE_ID = r.data?.universe?.id;
  t("Universe has id", !!UNIVERSE_ID);

  // Create session
  r = await req("/api/sessions", {
    method: "POST",
    token: TOKEN,
    body: { name: "Phase 6 Session", universe_id: UNIVERSE_ID },
  });
  t("Session creation returns 201", r.status === 201);
  const SESSION_ID = r.data?.session?.id;
  t("Session has id", !!SESSION_ID);

  // Create location
  r = await req("/api/locations", {
    method: "POST",
    token: TOKEN,
    body: { name: "Test Location", description: "A test location for Phase 6", importance: "medium" },
  });
  t("Location creation returns 201", r.status === 201);
  const LOCATION_ID = r.data?.location?.id;
  t("Location has id", !!LOCATION_ID);

  // Create NPC
  r = await req("/api/npcs", {
    method: "POST",
    token: TOKEN,
    body: { name: "Test NPC", description: "A test NPC for Phase 6", importance: "medium" },
  });
  t("NPC creation returns 201", r.status === 201);
  const NPC_ID = r.data?.npc?.id;
  t("NPC has id", !!NPC_ID);

  // ============================================================
  //  1. JOB QUEUE MANAGEMENT
  // ============================================================
  title("1. JOB QUEUE MANAGEMENT");

  // 1a. Queue a job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "summarize_messages", payload: { sessionId: SESSION_ID }, priority: "low" },
  });
  t("1a. Queue job returns 200", r.status === 200);
  t("1a. Returns success true", r.data?.success === true);
  t("1a. Returns jobId", !!r.data?.jobId);
  const JOB_ID_1 = r.data?.jobId;

  // 1b. Queue another job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "generate_embeddings", payload: { entityType: "location", entityId: LOCATION_ID }, priority: "medium" },
  });
  t("1b. Queue second job returns 200", r.status === 200);
  t("1b. Returns jobId", !!r.data?.jobId);

  // 1c. Get jobs list
  r = await req("/api/jobs", { token: TOKEN });
  t("1c. Get jobs returns 200", r.status === 200);
  t("1c. Returns jobs array", Array.isArray(r.data?.jobs));
  t("1c. Has at least 2 jobs", (r.data?.jobs || []).length >= 2);

  // 1d. Get job stats
  r = await req("/api/jobs?type=stats", { token: TOKEN });
  t("1d. Get stats returns 200", r.status === 200);
  t("1d. Returns stats object", !!r.data?.stats);

  // 1e. Cancel a job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "cancel", jobId: JOB_ID_1 },
  });
  t("1e. Cancel job returns 200", r.status === 200);
  t("1e. Returns success true", r.data?.success === true);

  // 1f. Cancel all jobs
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "cancel-all" },
  });
  t("1f. Cancel all jobs returns 200", r.status === 200);
  t("1f. Returns cancelledCount", typeof r.data?.cancelledCount === "number");

  // 1g. Queue idle jobs
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue-idle" },
  });
  if (r.status !== 200) console.log(`     DEBUG 1g: status=${r.status}, data=${JSON.stringify(r.data?.error || r.data)}`);
  t("1g. Queue idle jobs returns 200", r.status === 200);
  t("1g. Returns queuedCount", typeof r.data?.queuedCount === "number");

  // ============================================================
  //  2. JOB PROCESSING ENGINE
  // ============================================================
  title("2. JOB PROCESSING ENGINE");

  // 2a. Process next job (should handle gracefully when no jobs)
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-next" },
  });
  t("2a. Process next returns 200", r.status === 200);

  // 2b. Process all jobs
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process" },
  });
  t("2b. Process all returns 200", r.status === 200);
  t("2b. Returns success true", r.data?.success === true);

  // 2c. Queue invalid job type returns 400
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "invalid_type", payload: {} },
  });
  // Note: This may succeed at queue level but fail at process level
  t("2c. Queue invalid type accepted at queue level", r.status === 200 || r.status === 400);

  // 2d. Process without auth returns 401
  r = await req("/api/jobs", {
    method: "POST",
    body: { action: "process" },
  });
  t("2d. Process without auth returns 401", r.status === 401);

  // 2e. Get jobs without auth returns 401
  r = await req("/api/jobs");
  t("2e. Get jobs without auth returns 401", r.status === 401);

  // 2f. Delete jobs without auth returns 401
  r = await req("/api/jobs", { method: "DELETE" });
  t("2f. Delete jobs without auth returns 401", r.status === 401);

  // ============================================================
  //  3. MESSAGE SUMMARIZATION
  // ============================================================
  title("3. MESSAGE SUMMARIZATION");

  // 3a. Summarization needs > 15 messages (should return 0 for empty session)
  // This is tested via the library function, not API
  // We'll test the API route for idle processing instead

  // 3a. Queue summarization job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "summarize_messages", payload: { sessionId: SESSION_ID }, priority: "low" },
  });
  t("3a. Queue summarization returns 200", r.status === 200);
  t("3a. Returns jobId", !!r.data?.jobId);

  // 3b. Process summarization job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-next", type: "summarize_messages" },
  });
  t("3b. Process summarization returns 200", r.status === 200);

  // ============================================================
  //  4. EMBEDDING GENERATION
  // ============================================================
  title("4. EMBEDDING GENERATION");

  // 4a. Queue embedding job for location
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "generate_embeddings", payload: { entityType: "location", entityId: LOCATION_ID }, priority: "medium" },
  });
  t("4a. Queue embedding job returns 200", r.status === 200);
  t("4a. Returns jobId", !!r.data?.jobId);

  // 4b. Queue embedding job for NPC
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "generate_embeddings", payload: { entityType: "npc", entityId: NPC_ID }, priority: "medium" },
  });
  t("4b. Queue NPC embedding returns 200", r.status === 200);

  // 4c. Process embedding jobs
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-next", type: "generate_embeddings" },
  });
  t("4c. Process embedding returns 200", r.status === 200);

  // ============================================================
  //  5. RELATIONSHIP ANALYSIS
  // ============================================================
  title("5. RELATIONSHIP ANALYSIS");

  // 5a. Queue relationship analysis job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "analyze_relationships", payload: { sessionId: SESSION_ID }, priority: "medium" },
  });
  t("5a. Queue relationship analysis returns 200", r.status === 200);
  t("5a. Returns jobId", !!r.data?.jobId);

  // 5b. Process relationship analysis
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-next", type: "analyze_relationships" },
  });
  t("5b. Process relationship analysis returns 200", r.status === 200);

  // ============================================================
  //  6. LORE EXPANSION
  // ============================================================
  title("6. LORE EXPANSION");

  // 6a. Queue lore expansion job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "expand_lore", payload: { universeId: UNIVERSE_ID }, priority: "low" },
  });
  t("6a. Queue lore expansion returns 200", r.status === 200);
  t("6a. Returns jobId", !!r.data?.jobId);

  // 6b. Process lore expansion
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-next", type: "expand_lore" },
  });
  t("6b. Process lore expansion returns 200", r.status === 200);

  // ============================================================
  //  7. RELATIONSHIP DECAY
  // ============================================================
  title("7. RELATIONSHIP DECAY");

  // 7a. Queue decay job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "decay_relationships", payload: {}, priority: "low" },
  });
  t("7a. Queue decay job returns 200", r.status === 200);
  t("7a. Returns jobId", !!r.data?.jobId);

  // 7b. Process decay job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-next", type: "decay_relationships" },
  });
  t("7b. Process decay returns 200", r.status === 200);

  // ============================================================
  //  8. MEMORY COMPRESSION
  // ============================================================
  title("8. MEMORY COMPRESSION");

  // 8a. Queue compression job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue", type: "compress_memories", payload: { sessionId: SESSION_ID }, priority: "low" },
  });
  t("8a. Queue compression returns 200", r.status === 200);
  t("8a. Returns jobId", !!r.data?.jobId);

  // 8b. Process compression job
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-next", type: "compress_memories" },
  });
  t("8b. Process compression returns 200", r.status === 200);

  // ============================================================
  //  9. IDLE-TIME PROCESSING
  // ============================================================
  title("9. IDLE-TIME PROCESSING");

  // 9a. Process idle time
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "process-idle" },
  });
  t("9a. Process idle returns 200", r.status === 200);
  t("9a. Returns success true", r.data?.success === true);
  t("9a. Returns tiersProcessed array", Array.isArray(r.data?.tiersProcessed));

  // 9b. Queue idle jobs
  r = await req("/api/jobs", {
    method: "POST",
    token: TOKEN,
    body: { action: "queue-idle" },
  });
  if (r.status !== 200) console.log(`     DEBUG 9b: status=${r.status}, data=${JSON.stringify(r.data?.error || r.data)}`);
  t("9b. Queue idle returns 200", r.status === 200);
  t("9b. Returns queuedCount", typeof r.data?.queuedCount === "number");

  // ============================================================
  //  10. JOB API ROUTES - DELETE
  // ============================================================
  title("10. JOB API ROUTES - DELETE");

  // 10a. Delete all jobs
  r = await req("/api/jobs", {
    method: "DELETE",
    token: TOKEN,
  });
  t("10a. Delete all jobs returns 200", r.status === 200);
  t("10a. Returns success true", r.data?.success === true);

  // 10b. Delete specific job (should return success false if not found)
  r = await req("/api/jobs?id=non-existent-id", {
    method: "DELETE",
    token: TOKEN,
  });
  t("10b. Delete non-existent job returns 200", r.status === 200);
  t("10b. Returns success false", r.data?.success === false);

  // ============================================================
  //  11. DATABASE SCHEMA
  // ============================================================
  title("11. DATABASE SCHEMA");

  // Check job_queue table
  const Database = require("better-sqlite3");
  const path = require("path");
  const dbPath = path.join(process.cwd(), "data", "global.db");
  const db = new Database(dbPath, { readonly: true });

  // 11a. job_queue table exists
  const jobQueueTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='job_queue'").get();
  t("11a. job_queue table exists", !!jobQueueTable);

  // 11b. job_queue has required columns
  const jobQueueColumns = db.prepare("PRAGMA table_info(job_queue)").all();
  const jobQueueColumnNames = jobQueueColumns.map(c => c.name);
  t("11b. job_queue has id", jobQueueColumnNames.includes("id"));
  t("11b. job_queue has user_id", jobQueueColumnNames.includes("user_id"));
  t("11b. job_queue has type", jobQueueColumnNames.includes("type"));
  t("11b. job_queue has priority", jobQueueColumnNames.includes("priority"));
  t("11b. job_queue has status", jobQueueColumnNames.includes("status"));
  t("11b. job_queue has payload", jobQueueColumnNames.includes("payload"));
  t("11b. job_queue has created_at", jobQueueColumnNames.includes("created_at"));
  t("11b. job_queue has processed_at", jobQueueColumnNames.includes("processed_at"));
  t("11b. job_queue has error", jobQueueColumnNames.includes("error"));

  // 11c. message_summaries table exists
  const summariesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_summaries'").get();
  t("11c. message_summaries table exists", !!summariesTable);

  // 11d. embedding_index table exists
  const embeddingTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_index'").get();
  t("11d. embedding_index table exists", !!embeddingTable);

  // 11e. embedding_vectors table exists
  const vectorsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_vectors'").get();
  t("11e. embedding_vectors table exists", !!vectorsTable);

  // 11f. relationships table exists
  const relTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'").get();
  t("11f. relationships table exists", !!relTable);

  // 11g. relationships has decay_rates column
  const relColumns = db.prepare("PRAGMA table_info(relationships)").all();
  const relColumnNames = relColumns.map(c => c.name);
  t("11g. relationships has decay_rates", relColumnNames.includes("decay_rates"));

  // 11h. narrative_memories table exists
  const memTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='narrative_memories'").get();
  t("11h. narrative_memories table exists", !!memTable);

  // 11i. lore_validations table exists
  const loreValTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lore_validations'").get();
  t("11i. lore_validations table exists", !!loreValTable);

  // 11j. idx_job_queue_status index exists
  const jobIndex = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_job_queue_status'").get();
  t("11j. idx_job_queue_status index exists", !!jobIndex);

  db.close();

  // ============================================================
  //  CLEANUP
  // ============================================================
  title("CLEANUP");

  r = await req(`/api/sessions/${SESSION_ID}`, { method: "DELETE", token: TOKEN });
  t("Cleanup: session deleted", r.status === 200);

  // ============================================================
  //  RESULTS
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  PHASE 6 RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`  STATUS: ${failed === 0 ? "✅ ALL PASSED" : `❌ ${failed} FAILURES`}`);
  console.log(`${"=".repeat(60)}`);
}

main().catch(console.error);
