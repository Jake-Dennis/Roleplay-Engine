/**
 * Server-wide configuration module.
 *
 * Reads from the `server_config` DB table (singleton row) and falls back
 * to environment variables → hardcoded defaults. Changes made via the
 * settings API take effect without a server restart because every read
 * queries the DB fresh.
 *
 * Sampling parameters (temperature, top_p, top_k, num_predict, num_ctx)
 * are NOT stored as global server config anymore. They live in
 * `model_defaults` (per-model map) and are resolved at generation time
 * by `ollama.ts`. The only thing this module stores for sampling is
 * `useCustomSampling` (the master toggle) and `thinking_mode`.
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
    /**
     * Master toggle: when false, ollama.ts omits the sampling parameters
     * from the request and lets the model use its own defaults. When
     * true, the per-model overrides (or hardcoded OLLAMA_CONFIG fallbacks)
     * are sent.
     */
    useCustomSampling: boolean;
    /**
     * Optional separate model for background jobs (summarization, wiki
     * enrichment, NPC evolution, etc.). When `useJobsModel` is false OR
     * `jobModel` is null, jobs fall back to the user's chat model.
     */
    useJobsModel: boolean;
    jobModel: string | null;
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
  /**
   * Per-model generation overrides. Keyed by model name (e.g. "qwen3.5:9b").
   * When a model has an entry here, those values are used at generation
   * time (subject to `useCustomSampling` and any explicit caller options).
   * Missing fields fall back to OLLAMA_CONFIG hardcoded defaults.
   *
   * All fields are optional. To "remove" an override, set the value back
   * to the hardcoded default OR delete the model's entry from the map.
   */
  modelDefaults: ModelDefaultsMap;
}

/**
 * Per-model overrides for the five tunable generation parameters.
 * These are the ONLY fields written to the per-model slot — global
 * sampling columns no longer exist in the schema.
 */
export interface ModelSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  numPredict?: number;
  numCtx?: number;
}

export type ModelDefaultsMap = Record<string, ModelSettings>;

export type ServerConfigUpdate = Partial<{
  ollama_host: string;
  ollama_port: number;
  ollama_model: string;
  ollama_embedding_model: string;
  ollama_thinking_mode: boolean;
  ollama_use_custom_sampling: boolean;
  ollama_use_jobs_model: boolean;
  ollama_job_model: string | null;
  tts_host: string;
  tts_port: number;
  tts_default_voice: string;
  tts_default_speed: number;
  tts_default_volume: number;
  tts_default_format: string;
  tts_auto_play: boolean;
  tts_skip_long: boolean;
  tts_long_threshold: number;
  /**
   * Replaces the entire per-model defaults map. Pass an empty object to
   * clear all overrides. To update a single model, fetch the current map
   * via getServerConfig() and merge the change in the caller.
   */
  model_defaults: ModelDefaultsMap;
}>;

interface ServerConfigRow {
  id: string;
  ollama_host: string | null;
  ollama_port: number | null;
  ollama_model: string | null;
  ollama_embedding_model: string | null;
  ollama_thinking_mode: number | null;
  ollama_use_custom_sampling: number | null;
  ollama_use_jobs_model: number | null;
  ollama_job_model: string | null;
  tts_host: string | null;
  tts_port: number | null;
  tts_default_voice: string | null;
  tts_default_speed: number | null;
  tts_default_volume: number | null;
  tts_default_format: string | null;
  tts_auto_play: number | null;
  tts_skip_long: number | null;
  tts_long_threshold: number | null;
  model_defaults: string | null;
  updated_at: string;
}

// ── Fallback defaults (mirrors src/lib/config.ts env-var resolution) ─

const FALLBACK_OLLAMA_HOST = process.env.OLLAMA_HOST || "192.168.6.1";
const FALLBACK_OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || "11434", 10);
const FALLBACK_OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3.5:9b";
const FALLBACK_OLLAMA_EMBEDDING = process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3";
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
    // Graceful migration: add columns if they don't exist. The legacy
    // global sampling columns (ollama_num_ctx, ollama_temperature, etc.)
    // are intentionally NOT migrated — the per-model model_defaults map
    // is the only source of truth for sampling now.
    for (const col of [
      "ADD COLUMN ollama_thinking_mode INTEGER DEFAULT 0",
      "ADD COLUMN ollama_use_custom_sampling INTEGER DEFAULT 0",
      "ADD COLUMN ollama_use_jobs_model INTEGER DEFAULT 0",
      "ADD COLUMN ollama_job_model TEXT",
      "ADD COLUMN model_defaults TEXT",
    ]) {
      try { db.prepare(`ALTER TABLE server_config ${col}`).run(); } catch { /* already exists */ }
    }
    row = db.prepare("SELECT * FROM server_config WHERE id = 'singleton'").get() as ServerConfigRow | undefined;
  } catch {
    // DB not available yet (startup) — use fallbacks
  }

  const ollamaHost = row?.ollama_host ?? FALLBACK_OLLAMA_HOST;
  const ollamaPort = row?.ollama_port ?? FALLBACK_OLLAMA_PORT;
  const ttsHost = row?.tts_host ?? FALLBACK_TTS_HOST;
  const ttsPort = row?.tts_port ?? FALLBACK_TTS_PORT;

  // Parse the model_defaults JSON blob. Malformed JSON or wrong shape
  // (e.g. an array) falls back to an empty map — better to ignore bad
  // data than to crash every config read.
  let modelDefaults: ModelDefaultsMap = {};
  if (row?.model_defaults) {
    try {
      const parsed = JSON.parse(row.model_defaults);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        modelDefaults = parsed as ModelDefaultsMap;
      }
    } catch { /* corrupt JSON — treat as no overrides */ }
  }

  return {
    ollama: {
      host: ollamaHost,
      port: ollamaPort,
      get baseUrl() { return `http://${ollamaHost}:${ollamaPort}`; },
      model: row?.ollama_model ?? FALLBACK_OLLAMA_MODEL,
      embeddingModel: row?.ollama_embedding_model ?? FALLBACK_OLLAMA_EMBEDDING,
      thinkingMode: row?.ollama_thinking_mode === null ? false : Boolean(row?.ollama_thinking_mode),
      useCustomSampling: row?.ollama_use_custom_sampling === null ? false : Boolean(row?.ollama_use_custom_sampling),
      useJobsModel: row?.ollama_use_jobs_model === null ? false : Boolean(row?.ollama_use_jobs_model),
      jobModel: row?.ollama_job_model ?? null,
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
    modelDefaults,
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
    "ADD COLUMN ollama_use_custom_sampling INTEGER DEFAULT 0",
    "ADD COLUMN ollama_use_jobs_model INTEGER DEFAULT 0",
    "ADD COLUMN ollama_job_model TEXT",
    "ADD COLUMN model_defaults TEXT",
  ]) {
    try { db.prepare(`ALTER TABLE server_config ${col}`).run(); } catch { /* already exists */ }
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (key in emptyRow()) {
      // Use string concat for column names (they're whitelisted by the type)
      sets.push(`${key} = ?`);
      // SQLite doesn't accept booleans — convert to 0/1
      // model_defaults is stored as a JSON string
      const stored = key === "model_defaults"
        ? JSON.stringify(value)
        : typeof value === 'boolean' ? (value ? 1 : 0) : value;
      params.push(stored);
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
    ollama_use_custom_sampling: null,
    ollama_use_jobs_model: null,
    ollama_job_model: null,
    tts_host: null,
    tts_port: null,
    tts_default_voice: null,
    tts_default_speed: null,
    tts_default_volume: null,
    tts_default_format: null,
    tts_auto_play: null,
    tts_skip_long: null,
    tts_long_threshold: null,
    model_defaults: null,
  };
}
