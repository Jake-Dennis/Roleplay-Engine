/**
 * GET  /api/settings/benchmark?model=xxx   — Latest + history for a model
 * POST /api/settings/benchmark              — Start a benchmark run (background)
 * DELETE /api/settings/benchmark?model=xxx  — Clear results for a model
 *
 * Results are stored in the `benchmark_results` table — one row per run, per model.
 * A running flag (in-memory + DB row) prevents concurrent runs.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { withErrorHandler } from "@/lib/with-error-handler";
import { requireJson } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";
import { getDb } from "@/lib/db";
import { getServerConfig } from "@/lib/server-config";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

// In-memory run lock (per-process). Persisted to DB on start so other processes see it.
let activeRun: { model: string; startedAt: string; pid: number | null } | null = null;

interface BenchmarkRow {
  id: number;
  model: string;
  max_ctx_load: number | null;
  max_ctx_stress: number | null;
  stress_passed: number;
  gen_speed: number | null;
  prompt_tokens: number | null;
  host: string | null;
  rounds_json: string | null;
  tested_at: string;
  recommended_num_predict: number | null;
  speed_at_25: number | null;
  speed_at_100: number | null;
  nih_results: string | null;
}

// Idempotent — safe to call on every request. Mirrors the migration in
// server-config.ts so this route is self-sufficient even if the settings
// page hasn't been opened yet.
function ensureBenchmarkTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS benchmark_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      max_ctx_load INTEGER,
      max_ctx_stress INTEGER,
      stress_passed INTEGER DEFAULT 0,
      gen_speed REAL,
      prompt_tokens INTEGER,
      host TEXT,
      rounds_json TEXT,
      tested_at TEXT DEFAULT (datetime('now')),
      recommended_num_predict INTEGER,
      speed_at_25 INTEGER,
      speed_at_100 INTEGER,
      nih_results TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_benchmark_model ON benchmark_results(model);
    CREATE INDEX IF NOT EXISTS idx_benchmark_tested ON benchmark_results(tested_at);
  `);
  // Migrations for existing DBs that pre-date these columns
  try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN rounds_json TEXT").run(); } catch {}
  try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN recommended_num_predict INTEGER").run(); } catch {}
  try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN speed_at_25 INTEGER").run(); } catch {}
  try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN speed_at_100 INTEGER").run(); } catch {}
  try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN nih_results TEXT").run(); } catch {}
}

// In-flight rows older than this are considered stale (e.g. server restart
// killed the child process but left the marker row behind). A normal
// benchmark finishes in under an hour; 2h is a safe upper bound.
const STALE_INFLIGHT_MINUTES = 120;

function readActiveRun(): BenchmarkRow | null {
  try {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM benchmark_results WHERE stress_passed = -1 ORDER BY tested_at DESC LIMIT 1"
    ).get() as BenchmarkRow | null;
  } catch { return null; }
}

// True if the in-flight row exists but is older than the staleness threshold.
// Caller should treat it as "not actually running" so a new run can start.
function isStaleInflight(row: BenchmarkRow | null): boolean {
  if (!row) return false;
  const startedAt = new Date(row.tested_at.includes("T") ? row.tested_at : row.tested_at.replace(" ", "T") + "Z");
  if (isNaN(startedAt.getTime())) return false;
  const ageMs = Date.now() - startedAt.getTime();
  return ageMs > STALE_INFLIGHT_MINUTES * 60 * 1000;
}

function parseRounds(json: string | null): unknown[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function markComplete() {
  // Clear stale in-flight marker row (stress_passed = -1) — used when something
  // goes wrong (script missing, spawn fails). Normal exits leave the row in
  // place since the script has already UPDATEd it to its final state.
  try {
    const db = getDb();
    db.prepare("DELETE FROM benchmark_results WHERE stress_passed = -1").run();
  } catch {}
  activeRun = null;
}

// ── GET ──────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;

  ensureBenchmarkTable();

  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");

  if (!model) {
    return NextResponse.json({ error: "model query param required" }, { status: 400 });
  }

  const db = getDb();

  // Check if there's an active (in-flight) run for this model.
  // Stale rows (server restart killed the child, etc.) are treated as not running.
  const inFlight = readActiveRun();
  const stale = isStaleInflight(inFlight);
  const isRunning = !!inFlight && inFlight.model === model && !stale;

  // Latest completed result (excludes in-flight rows)
  const latest = db.prepare(
    "SELECT * FROM benchmark_results WHERE model = ? AND stress_passed != -1 ORDER BY tested_at DESC LIMIT 1"
  ).get(model) as BenchmarkRow | undefined;

  // History (last 10 completed runs)
  const history = db.prepare(
    "SELECT id, model, max_ctx_load, max_ctx_stress, stress_passed, gen_speed, tested_at FROM benchmark_results WHERE model = ? AND stress_passed != -1 ORDER BY tested_at DESC LIMIT 10"
  ).all(model) as BenchmarkRow[];

  // If running, the in-flight row IS the live result — surface its round data
  // so the UI can show progress without waiting for completion.
  const display = isRunning && inFlight ? inFlight : latest;

  return NextResponse.json({
    model,
    running: isRunning,
    runningStartedAt: inFlight?.tested_at ?? null,
    latest: display ? {
      ...display,
      rounds: parseRounds(display.rounds_json),
      recommended_num_predict: display.recommended_num_predict,
      speed_at_25: display.speed_at_25,
      speed_at_100: display.speed_at_100,
      nih_results: parseRounds(display.nih_results),
    } : null,
    history,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;

  ensureBenchmarkTable();

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`benchmark_run:${ip}`, "jobs_trigger");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json().catch(() => ({}));
  const model: string = body.model || getServerConfig().ollama.model;
  const minCtx: number = body.min ?? 4096;
  const maxCtx: number = body.max ?? 262144;

  // Don't start a second run while one is in flight. Stale rows (e.g. from
  // a previous server crash) are automatically cleared so the new run can start.
  const inFlight = readActiveRun();
  if (inFlight && !isStaleInflight(inFlight)) {
    return NextResponse.json({
      error: "A benchmark is already running",
      runningModel: inFlight.model,
      startedAt: inFlight.tested_at,
    }, { status: 409 });
  }
  if (inFlight && isStaleInflight(inFlight)) {
    // Clean up the stale row before starting fresh
    markComplete();
  }

  // Insert in-flight marker row so other processes / page reloads see the state.
  // The script UPDATES this row in place as it runs (rounds_json + final state),
  // so the UI can poll and show live progress.
  const db = getDb();
  const inflightResult = db.prepare(
    "INSERT INTO benchmark_results (model, stress_passed, max_ctx_load, max_ctx_stress, tested_at, rounds_json) VALUES (?, -1, NULL, NULL, ?, '[]')"
  ).run(model, new Date().toISOString());
  const inflightId = Number(inflightResult.lastInsertRowid);

  // Resolve paths — script lives at scripts/benchmark-context.mjs
  const scriptPath = path.join(process.cwd(), "scripts", "benchmark-context.mjs");
  if (!fs.existsSync(scriptPath)) {
    markComplete();
    return NextResponse.json({ error: "Benchmark script not found", path: scriptPath }, { status: 500 });
  }

  // Spawn detached so the route handler can return immediately.
  // On Windows, detached:true requires the child to not share stdio with the parent.
  const child = spawn(process.execPath, [
    scriptPath,
    model,
    "--min", String(minCtx),
    "--max", String(maxCtx),
    "--precision", "1024",
    "--timeout", "180",
    "--save",
    "--inflight-id", String(inflightId),
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();

  // On exit, just clear the in-memory lock. The script has already UPDATED
  // the in-flight row to its final state (stress_passed = 0 or 1) — the same
  // row is now the latest completed result.
  child.on("exit", () => {
    activeRun = null;
  });

  activeRun = { model, startedAt: new Date().toISOString(), pid: child.pid ?? null };

  return NextResponse.json({
    started: true,
    model,
    minCtx,
    maxCtx,
    pid: child.pid ?? null,
    startedAt: activeRun.startedAt,
    inflightId,
  });
});

// ── DELETE ───────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;

  ensureBenchmarkTable();

  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");

  const db = getDb();
  if (model) {
    db.prepare("DELETE FROM benchmark_results WHERE model = ?").run(model);
  } else {
    db.prepare("DELETE FROM benchmark_results").run();
  }

  return NextResponse.json({ cleared: true, model: model ?? "all" });
});
