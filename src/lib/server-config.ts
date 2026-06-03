/**
 * Server-wide configuration module.
 *
 * Reads from the `server_config` DB table (singleton row) and falls back
 * to environment variables → hardcoded defaults. Changes made via the
 * settings API take effect without a server restart because every read
 * queries the DB fresh.
 *
 * Usage:
 *   import { getServerConfig, updateServerConfig } from '@/lib/server-config';
 *   const config = getServerConfig();
 *   console.log(config.ollama.host); // DB value → env var → hardcoded default
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface ResolvedServerConfig {
  ollama: {
    host: string;
    port: number;
    baseUrl: string;
    model: string;
    embeddingModel: string;
    thinkingMode: boolean;
    numCtx?: number;
    useCustomSampling: boolean;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    numPredict?: number;
    jobNumCtx?: number;
    jobNumPredict?: number;
  };
  tts: {
    host: string;
    port: number;
    baseUrl: string;
    defaultVoice: string;
    defaultSpeed: number;
    defaultVolume: number;
    defaultFormat: string;
    autoPlay: boolean;
    skipLong: boolean;
    longThreshold: number;
  };
}

export type ServerConfigUpdate = Partial<{
  ollama_host: string;
  ollama_port: number;
  ollama_model: string;
  ollama_embedding_model: string;
  ollama_thinking_mode: boolean;
  ollama_num_ctx: number;
  ollama_use_custom_sampling: boolean;
  ollama_temperature: number;
  ollama_top_p: number;
  ollama_top_k: number;
  ollama_num_predict: number;
  ollama_job_num_ctx: number;
  ollama_job_num_predict: number;
  tts_host: string;
  tts_port: number;
  tts_default_voice: string;
  tts_default_speed: number;
  tts_default_volume: number;
  tts_default_format: string;
  tts_auto_play: boolean;
  tts_skip_long: boolean;
  tts_long_threshold: number;
}>;

interface ServerConfigRow {
  id: string;
  ollama_host: string | null;
  ollama_port: number | null;
  ollama_model: string | null;
  ollama_embedding_model: string | null;
  ollama_thinking_mode: number | null;
  ollama_num_ctx: number | null;
  ollama_use_custom_sampling: number | null;
  ollama_temperature: number | null;
  ollama_top_p: number | null;
  ollama_top_k: number | null;
  ollama_num_predict: number | null;
  ollama_job_num_ctx: number | null;
  ollama_job_num_predict: number | null;
  tts_host: string | null;
  tts_port: number | null;
  tts_default_voice: string | null;
  tts_default_speed: number | null;
  tts_default_volume: number | null;
  tts_default_format: string | null;
  tts_auto_play: number | null;
  tts_skip_long: number | null;
  tts_long_threshold: number | null;
  updated_at: string;
}

// ── Fallback defaults (mirrors src/lib/config.ts env-var resolution) ─

const FALLBACK_OLLAMA_HOST = process.env.OLLAMA_HOST || "192.168.4.2";
const FALLBACK_OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || "11434", 10);
const FALLBACK_OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3.5:9b";
const FALLBACK_OLLAMA_EMBEDDING = process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3";
const FALLBACK_OLLAMA_TEMPERATURE = 1.0;
const FALLBACK_OLLAMA_TOP_P = 0.95;
const FALLBACK_OLLAMA_TOP_K = 64;
const FALLBACK_OLLAMA_NUM_PREDICT = -1;    // -1 = no limit
const FALLBACK_OLLAMA_JOB_NUM_CTX = 131072;
const FALLBACK_OLLAMA_JOB_NUM_PREDICT = -1;
const FALLBACK_TTS_HOST = process.env.TTS_HOST || "192.168.4.2";
const FALLBACK_TTS_PORT = parseInt(process.env.TTS_PORT || "8880", 10);

// ── Public API ─────────────────────────────────────────────────────

/**
 * Read the server_config singleton and merge with env-var / hardcoded fallbacks.
 */
export function getServerConfig(): ResolvedServerConfig {
  let row: ServerConfigRow | undefined;
  try {
    const db = getDb();
    // Graceful migration: add columns if they don't exist
    for (const col of [
      "ADD COLUMN ollama_thinking_mode INTEGER DEFAULT 0",
      "ADD COLUMN ollama_num_ctx INTEGER",
      "ADD COLUMN ollama_use_custom_sampling INTEGER DEFAULT 1",
      "ADD COLUMN ollama_temperature REAL",
      "ADD COLUMN ollama_top_p REAL",
      "ADD COLUMN ollama_top_k INTEGER",
      "ADD COLUMN ollama_num_predict INTEGER",
      "ADD COLUMN ollama_job_num_ctx INTEGER",
      "ADD COLUMN ollama_job_num_predict INTEGER",
    ]) {
      try { db.prepare(`ALTER TABLE server_config ${col}`).run(); } catch { /* already exists */ }
    }
    // Graceful migration: create benchmark_results table if it doesn't exist
    // (added after init-db.ts was already shipped; CREATE TABLE IF NOT EXISTS is a no-op on re-run)
    try {
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
      // Migrations for existing tables — add columns that post-date the original schema
      try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN rounds_json TEXT").run(); } catch {}
      try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN recommended_num_predict INTEGER").run(); } catch {}
      try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN speed_at_25 INTEGER").run(); } catch {}
      try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN speed_at_100 INTEGER").run(); } catch {}
      try { db.prepare("ALTER TABLE benchmark_results ADD COLUMN nih_results TEXT").run(); } catch {}
    } catch { /* non-critical */ }
    row = db.prepare("SELECT * FROM server_config WHERE id = 'singleton'").get() as ServerConfigRow | undefined;
  } catch {
    // DB not available yet (startup) — use fallbacks
  }

  const ollamaHost = row?.ollama_host ?? FALLBACK_OLLAMA_HOST;
  const ollamaPort = row?.ollama_port ?? FALLBACK_OLLAMA_PORT;
  const ttsHost = row?.tts_host ?? FALLBACK_TTS_HOST;
  const ttsPort = row?.tts_port ?? FALLBACK_TTS_PORT;

  return {
    ollama: {
      host: ollamaHost,
      port: ollamaPort,
      get baseUrl() { return `http://${ollamaHost}:${ollamaPort}`; },
      model: row?.ollama_model ?? FALLBACK_OLLAMA_MODEL,
      embeddingModel: row?.ollama_embedding_model ?? FALLBACK_OLLAMA_EMBEDDING,
      thinkingMode: row?.ollama_thinking_mode === null ? false : Boolean(row?.ollama_thinking_mode),
      numCtx: row?.ollama_num_ctx ?? undefined,
      useCustomSampling: row?.ollama_use_custom_sampling === null ? true : Boolean(row?.ollama_use_custom_sampling),
      temperature: row?.ollama_temperature ?? FALLBACK_OLLAMA_TEMPERATURE,
      top_p: row?.ollama_top_p ?? FALLBACK_OLLAMA_TOP_P,
      top_k: row?.ollama_top_k ?? FALLBACK_OLLAMA_TOP_K,
      numPredict: row?.ollama_num_predict ?? FALLBACK_OLLAMA_NUM_PREDICT,
      jobNumCtx: row?.ollama_job_num_ctx ?? FALLBACK_OLLAMA_JOB_NUM_CTX,
      jobNumPredict: row?.ollama_job_num_predict ?? FALLBACK_OLLAMA_JOB_NUM_PREDICT,
    },
    tts: {
      host: ttsHost,
      port: ttsPort,
      get baseUrl() { return `http://${ttsHost}:${ttsPort}`; },
      defaultVoice: row?.tts_default_voice ?? "af_heart",
      defaultSpeed: row?.tts_default_speed ?? 1.0,
      defaultVolume: row?.tts_default_volume ?? 0.8,
      defaultFormat: row?.tts_default_format ?? "mp3",
      autoPlay: row?.tts_auto_play === null ? true : Boolean(row?.tts_auto_play),
      skipLong: row?.tts_skip_long === null ? true : Boolean(row?.tts_skip_long),
      longThreshold: row?.tts_long_threshold ?? 500,
    },
  };
}

/**
 * Persist changes to the server_config singleton row.
 * Only provided fields are updated (partial merge).
 */
export function updateServerConfig(changes: ServerConfigUpdate): void {
  const db = getDb();

  // Ensure any pending column migrations are applied (same as getServerConfig does)
  for (const col of [
    "ADD COLUMN ollama_thinking_mode INTEGER DEFAULT 0",
    "ADD COLUMN ollama_num_ctx INTEGER",
    "ADD COLUMN ollama_use_custom_sampling INTEGER DEFAULT 1",
    "ADD COLUMN ollama_temperature REAL",
    "ADD COLUMN ollama_top_p REAL",
    "ADD COLUMN ollama_top_k INTEGER",
    "ADD COLUMN ollama_num_predict INTEGER",
    "ADD COLUMN ollama_job_num_ctx INTEGER",
    "ADD COLUMN ollama_job_num_predict INTEGER",
  ]) {
    try { db.prepare(`ALTER TABLE server_config ${col}`).run(); } catch { /* already exists */ }
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && key in emptyRow()) {
      // Use string concat for column names (they're whitelisted by the type)
      sets.push(`${key} = ?`);
      // SQLite doesn't accept booleans — convert to 0/1
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE server_config SET ${sets.join(", ")} WHERE id = 'singleton'`).run(...params);
}

function emptyRow(): Record<string, null> {
  return {
    ollama_host: null,
    ollama_port: null,
    ollama_model: null,
    ollama_embedding_model: null,
    ollama_thinking_mode: null,
    ollama_num_ctx: null,
    ollama_use_custom_sampling: null,
    ollama_temperature: null,
    ollama_top_p: null,
    ollama_top_k: null,
    ollama_num_predict: null,
    ollama_job_num_ctx: null,
    ollama_job_num_predict: null,
    tts_host: null,
    tts_port: null,
    tts_default_voice: null,
    tts_default_speed: null,
    tts_default_volume: null,
    tts_default_format: null,
    tts_auto_play: null,
    tts_skip_long: null,
    tts_long_threshold: null,
  };
}
