export const OLLAMA_CONFIG = {
  host: process.env.OLLAMA_HOST || "192.168.4.2",
  port: parseInt(process.env.OLLAMA_PORT || "11434", 10),
  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },
  model: process.env.OLLAMA_MODEL || "qwen3.5:9b",
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3",
  timeout: 120000,
  embeddingTimeout: 30000,
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
  jwtSecret: process.env.JWT_SECRET || "change-this-to-a-random-secret-key",
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
