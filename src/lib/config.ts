import { DEDUP_WINDOW_MS, JOB_DEBOUNCE_INTERVALS, JOB_RETENTION_DAYS } from "./jobs/types";

/**
 * Ollama LLM configuration.
 * Controls connection to the self-hosted Ollama instance,
 * model selection, generation parameters, and retry behavior.
 *
 * NOTE: These values are FALLBACK DEFAULTS only. The actual model used
 * at generation time is resolved via user settings (getUserModels):
 *   persona.llmModel > user_settings.llmModel > OLLAMA_CONFIG.model
 * Same for embeddingModel: user_settings.embeddingModel > this default.
 * See ollama.ts getUserModels() and generate/[id]/route.ts for the chain.
 */
export const OLLAMA_CONFIG = {
  host: process.env.OLLAMA_HOST || "192.168.6.1",
  port: parseInt(process.env.OLLAMA_PORT || "11434", 10),
  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },
  model: process.env.OLLAMA_MODEL || "qwen3.5:9B",
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "qwen3-embedding:8b",
  // 30-minute timeout for generation — qwen3.5:9B can take several
  // minutes to cold-start (model load into VRAM over LAN).
  timeout: 1800000,
  // 10-minute timeout for embeddings — generous for cold-start + retries
  embeddingTimeout: 600000,
  // 3 retries with 2s exponential backoff for streaming fetch
  retryAttempts: 3,
  retryDelay: 2000,
  options: {
    temperature: 0.8,
    top_p: 0.9,
    top_k: 64,
    // -1 = no limit. Per-model overrides via model_defaults[model].num_predict
    // take precedence when set; this is just the last-resort fallback.
    num_predict: -1,
    // num_ctx is per-model via model_defaults[model].numCtx — no global
    // hardcoded default here (let Ollama use the model's native window
    // when no per-model override is set).
  },
};

/**
 * Text-to-Speech configuration.
 * Controls connection to the TTS service, voice selection,
 * audio format, caching, and retry behavior.
 */
export const TTS_CONFIG = {
  host: process.env.TTS_HOST || "192.168.4.2",
  port: parseInt(process.env.TTS_PORT || "8880", 10),
  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },
  model: "kokoro",
  defaultFormat: "mp3",
  defaultSpeed: 1.0,
  defaultVoice: "af_heart",
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 2000,
  cacheEnabled: true,
  cacheMaxAge: 7 * 24 * 60 * 60,
};

/**
 * Retrieve the JWT signing secret from environment variables.
 * Throws a fatal error if JWT_SECRET is not configured.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "FATAL: JWT_SECRET environment variable is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return secret;
}

/**
 * Authentication configuration.
 * Controls JWT expiry, bcrypt rounds, and username/password validation rules.
 */
export const AUTH_CONFIG = {
  get jwtSecret() {
    return getJwtSecret();
  },
  jwtExpiry: 86400, // 24 hours in seconds
  bcryptRounds: 12,
  usernameMinLength: 3,
  usernameMaxLength: 20,
  usernamePattern: /^[a-zA-Z0-9_\-@.!#$%^&*()+=]+$/,
  passwordMinLength: 8,
};

/**
 * Application-level configuration.
 * Controls server port and data directory path.
 */
export const APP_CONFIG = {
  port: parseInt(process.env.PORT || "3000", 10),
  dataDir: process.env.DATA_DIR || "./data",
};

/**
 * Time constants in milliseconds.
 * Used throughout the application for expiry, intervals, and time comparisons.
 */
export const TIME = {
  ONE_SECOND: 1000,
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  THREE_DAYS: 3 * 24 * 60 * 60 * 1000,
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,
  THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
  NINETY_DAYS: 90 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Content size limits in characters.
 * Used for truncation boundaries in wiki content and summaries.
 */
export const CONTENT_LIMITS = {
  SHORT: 200,
  MEDIUM: 5000,
  PREVIEW: 300,
  SUMMARY_CHUNK: 1000,
} as const;

/**
 * Timeout values in milliseconds for various operations.
 * Controls health checks, TTS, LLM fetch, and other async operations.
 */
export const TIMEOUTS = {
  HEALTH_CHECK: 3000,
  VOICE_DISCOVERY: 5000,
  TTS_CONNECTION: 5000,
  MODEL_FETCH: 10000,
  LLM_FETCH: 30000,
  HEALTH_CHECK_INTERVAL: 30000,
} as const;

/**
 * Idle processing tiers in milliseconds.
 * Defines the intervals at which background jobs are triggered
 * (5min, 10min, 15min, 30min).
 */
export const IDLE_TIERS = {
  TIER_1: 5 * 60 * 1000,
  TIER_2: 10 * 60 * 1000,
  TIER_3: 15 * 60 * 1000,
  TIER_4: 30 * 60 * 1000,
} as const;

/**
 * Memory compression thresholds and age tier boundaries.
 * Controls when compression triggers and how aggressively
 * old content is summarized based on age.
 */
export const MEMORY_CONFIG = {
  MEMORY_COMPRESSION_THRESHOLD: 100,  // Narrative memories count before compression triggers
  MESSAGE_COMPRESSION_THRESHOLD: 500, // Messages per session before compression triggers
  RECENT_DAYS: 7,                     // Age boundary: recent (no compression)
  SHORT_TERM_DAYS: 30,                // Age boundary: short-term (light compression)
  LONG_TERM_DAYS: 90,                 // Age boundary: long-term (heavy compression)
} as const;

/**
 * Event bus capacity limits.
 * Controls in-memory event history retention and concurrent SSE connection limits.
 */
export const EVENT_BUS_CONFIG = {
  MAX_HISTORY: 100,    // Max events stored per session for Last-Event-ID reconnection
  MAX_CONNECTIONS: 50, // Max concurrent SSE connections per session
} as const;

/**
 * Job deduplication and retention configuration.
 * Controls how long jobs are retained, dedup windows, and debounce intervals.
 * Values are imported and re-exported from jobs/types for centralized config access.
 */
export const JOB_CONFIG = {
  DEDUP_WINDOW_MS,
  JOB_DEBOUNCE_INTERVALS,
  JOB_RETENTION_DAYS,
} as const;

/**
 * Prompt token budget allocation.
 *
 * @deprecated prompt-builder.ts now uses remainder-based budget allocation (see
 * applyContextBudget). This constant is preserved only for the debug/retrieval-context
 * inspector endpoint (route.ts). Do NOT import for new code.
 *
 * OVERHEAD is a fixed token reservation; all other values are fractional (0-1)
 * applied to the remaining tokens (maxTokens - OVERHEAD).
 * Total max context: 6000 tokens.
 */
export const PROMPT_BUDGET = {
  OVERHEAD: 500,         // System prompt + instructions
  MESSAGES: 1.0,         // Full context — no artificial limits
  LORE: 1.0,             // "
  MEMORIES: 1.0,         // "
  RELATIONSHIPS: 1.0,    // "
  ACTIVE_THREADS: 1.0,   // "
  MESSAGE_SUMMARIES: 1.0,// "
  DECISION_POINTS: 1.0,  // "
} as const;
