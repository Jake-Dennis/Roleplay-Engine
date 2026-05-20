export const OLLAMA_CONFIG = {
  host: process.env.OLLAMA_HOST || "192.168.4.2",
  port: parseInt(process.env.OLLAMA_PORT || "11434", 10),
  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },
  model: process.env.OLLAMA_MODEL || "qwen3.5:4b",
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3",
  timeout: 600000,
  embeddingTimeout: 120000,
  retryAttempts: 3,
  retryDelay: 2000,
  options: {
    temperature: 0.8,
    top_p: 0.9,
    num_ctx: 8192,
  },
};

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
  maxTextLength: 500,
  cacheEnabled: true,
  cacheMaxAge: 7 * 24 * 60 * 60,
};

export const AUTH_CONFIG = {
  jwtSecret: (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        "FATAL: JWT_SECRET environment variable is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
      );
    }
    return secret;
  })(),
  jwtExpiry: 86400, // 24 hours in seconds
  bcryptRounds: 12,
  usernameMinLength: 3,
  usernameMaxLength: 20,
  usernamePattern: /^[a-zA-Z0-9_]+$/,
  passwordMinLength: 8,
};

export const APP_CONFIG = {
  port: parseInt(process.env.PORT || "3000", 10),
  dataDir: process.env.DATA_DIR || "./data",
};

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

export const CONTENT_LIMITS = {
  SHORT: 200,
  MEDIUM: 5000,
  PREVIEW: 300,
  SUMMARY_CHUNK: 1000,
} as const;

export const TIMEOUTS = {
  HEALTH_CHECK: 3000,
  VOICE_DISCOVERY: 5000,
  TTS_CONNECTION: 5000,
  MODEL_FETCH: 10000,
  LLM_FETCH: 30000,
  HEALTH_CHECK_INTERVAL: 30000,
} as const;

export const IDLE_TIERS = {
  TIER_1: 5 * 60 * 1000,
  TIER_2: 10 * 60 * 1000,
  TIER_3: 15 * 60 * 1000,
  TIER_4: 30 * 60 * 1000,
} as const;
