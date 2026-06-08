import { OLLAMA_CONFIG, TIMEOUTS } from "./config";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OllamaModelMeta {
  name: string;
  contextWindow: number; // num_ctx from model, or 0 if unknown
  parameterCount: number; // estimated from "4B", "7B", etc.
  quantization?: string; // e.g., "q4_k_m", "fp16"
  family?: string; // e.g., "llama", "qwen", "gemma"
  license?: string;
  modelfile?: string;
  sizeBytes: number; // model file size
}

interface OllamaShowResponse {
  model_info?: Record<string, string | number | boolean>;
  parameters?: string;
  template?: string;
  license?: string;
  modelfile?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: OllamaModelMeta;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const modelCache = new Map<string, CacheEntry>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse parameter size string (e.g., "4B", "7B", "0.5B", "13B") to number.
 */
function parseParameterSize(paramStr: string): number {
  const match = paramStr.match(/^([\d.]+)\s*([KMGT]?)B?$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const multipliers: Record<string, number> = {
    "": 1,
    K: 1_000,
    M: 1_000_000,
    G: 1_000_000_000,
    T: 1_000_000_000_000,
  };

  return Math.round(value * (multipliers[unit] || 1));
}

/**
 * Extract quantization from model name or modelfile.
 */
function extractQuantization(modelName: string, modelfile?: string): string | undefined {
  // Common quantization patterns in model names
  const quantPatterns = [
    /q\d+_k_m/,
    /q\d+_k_s/,
    /q\d+_k/,
    /q\d+_m/,
    /q\d+_s/,
    /q\d+/,
    /fp16/,
    /bf16/,
    /f16/,
    /f32/,
    /int4/,
    /int8/,
  ];

  for (const pattern of quantPatterns) {
    const match = modelName.match(pattern);
    if (match) return match[0].toLowerCase();
  }

  // Check modelfile for quantization hints
  if (modelfile) {
    for (const pattern of quantPatterns) {
      const match = modelfile.match(pattern);
      if (match) return match[0].toLowerCase();
    }
  }

  return undefined;
}

/**
 * Extract model family from name or details.
 */
function extractFamily(modelName: string, details?: OllamaShowResponse["details"]): string | undefined {
  if (details?.family) return details.family;
  if (details?.families?.[0]) return details.families[0];

  // Common model family prefixes
  const families = [
    "llama",
    "qwen",
    "gemma",
    "mistral",
    "phi",
    "deepseek",
    "codellama",
    "starcoder",
    "neural-chat",
    "dolphin",
    "orca",
    "wizard",
    "vicuna",
    "alpaca",
    "nous",
    "zephyr",
    "solar",
    "yi",
    "baichuan",
    "chatglm",
    "internlm",
    "xwin",
  ];

  const lowerName = modelName.toLowerCase();
  for (const family of families) {
    if (lowerName.startsWith(family) || lowerName.includes(`-${family}`) || lowerName.includes(`:${family}`)) {
      return family;
    }
  }

  return undefined;
}

/**
 * Estimate VRAM needed for a model with given context window.
 * Rough heuristic: parameters * bytes_per_param + context * kv_cache_per_token * layers
 */
export function estimateVRAMForContext(
  paramCount: number,
  contextWindow: number,
  quantization?: string
): number {
  // Base bytes per parameter based on quantization
  let bytesPerParam = 2; // fp16 default
  if (quantization) {
    const q = quantization.toLowerCase();
    if (q.includes("q4") || q.includes("int4") || q.includes("4bit")) {
      bytesPerParam = 0.5;
    } else if (q.includes("q5")) {
      bytesPerParam = 0.625;
    } else if (q.includes("q6")) {
      bytesPerParam = 0.75;
    } else if (q.includes("q8") || q.includes("int8")) {
      bytesPerParam = 1;
    } else if (q.includes("fp16") || q.includes("f16") || q.includes("bf16")) {
      bytesPerParam = 2;
    } else if (q.includes("fp32") || q.includes("f32")) {
      bytesPerParam = 4;
    }
  }

  // Estimate number of layers from parameter count (rough heuristic)
  // Most models: ~1 layer per ~100M params for smaller, ~1 per ~200-300M for larger
  let estimatedLayers: number;
  if (paramCount < 1_000_000_000) {
    estimatedLayers = 24; // e.g., 0.5B-1B models
  } else if (paramCount < 7_000_000_000) {
    estimatedLayers = 32; // 3B-7B models
  } else if (paramCount < 20_000_000_000) {
    estimatedLayers = 40; // 13B-14B models
  } else {
    estimatedLayers = 60; // 30B+ models
  }

  // Model weights
  const modelSize = paramCount * bytesPerParam;

  // KV cache: 2 * context * layers * head_dim * 2 (key + value)
  // head_dim typically = hidden_size / num_heads ≈ 128 for most models
  // Simplified: ~2 bytes per token per layer for quantized, 4 for fp16
  const kvBytesPerTokenPerLayer = bytesPerParam <= 1 ? 1 : 2;
  const kvCacheSize = contextWindow * estimatedLayers * kvBytesPerTokenPerLayer * 2; // key + value

  // Add 10% overhead for activations, etc.
  const total = (modelSize + kvCacheSize) * 1.1;

  return Math.round(total);
}

/**
 * Parse size string (e.g., "4.2 GB", "4200 MB") to bytes.
 */
function parseSizeToBytes(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)\s*(KB|MB|GB|TB|B)?$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.round(value * (multipliers[unit] || 1));
}

/**
 * Build OllamaModelMeta from API response.
 */
function buildModelMeta(modelName: string, response: OllamaShowResponse): OllamaModelMeta {
  const details = response.details;
  const modelInfo = response.model_info || {};

  // Extract context window (num_ctx)
  let contextWindow = 0;
  const numCtx = modelInfo["num_ctx"] || modelInfo["context_length"] || modelInfo["n_ctx"];
  if (typeof numCtx === "number") {
    contextWindow = numCtx;
  } else if (typeof numCtx === "string") {
    contextWindow = parseInt(numCtx, 10) || 0;
  }

  // Extract parameter count
  let parameterCount = 0;
  if (details?.parameter_size) {
    parameterCount = parseParameterSize(details.parameter_size);
  } else if (response.parameters) {
    parameterCount = parseParameterSize(response.parameters);
  } else {
    // Try to extract from model name (e.g., "qwen3.5:4b" -> 4B)
    const nameParamMatch = modelName.match(/[:/](\d+\.?\d*)[bB]/);
    if (nameParamMatch) {
      parameterCount = parseParameterSize(`${nameParamMatch[1]}B`);
    }
  }

  // Extract quantization
  const quantization = extractQuantization(modelName, response.modelfile) || details?.quantization_level;

  // Extract family
  const family = extractFamily(modelName, details);

  // Extract size
  let sizeBytes = 0;
  if (modelInfo["size"]) {
    sizeBytes = parseSizeToBytes(String(modelInfo["size"]));
  }

  return {
    name: modelName,
    contextWindow,
    parameterCount,
    quantization,
    family,
    license: response.license,
    modelfile: response.modelfile,
    sizeBytes,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch model metadata from Ollama /api/show endpoint.
 * @param modelName - Model name (e.g., "qwen3.5:4b")
 * @param ollamaHost - Optional Ollama host URL (defaults to OLLAMA_CONFIG.baseUrl)
 * @returns Parsed model metadata
 */
export async function getModelMeta(modelName: string, ollamaHost?: string): Promise<OllamaModelMeta> {
  const baseUrl = ollamaHost || OLLAMA_CONFIG.baseUrl;
  const cacheKey = `${baseUrl}:${modelName}`;

  // Check cache
  const cached = modelCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug("[ollama-meta] Cache hit", { modelName });
    return cached.data;
  }

  // Try with retry (once)
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      logger.debug("[ollama-meta] Fetching model metadata", { modelName, attempt, baseUrl });

      const response = await fetch(`${baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(TIMEOUTS.MODEL_FETCH),
      });

      if (!response.ok) {
        throw new Error(`Ollama responded with ${response.status}: ${response.statusText}`);
      }

      const data: OllamaShowResponse = await response.json();
      const meta = buildModelMeta(modelName, data);

      // Cache the result
      modelCache.set(cacheKey, { data: meta, timestamp: Date.now() });

      logger.debug("[ollama-meta] Fetched model metadata", {
        modelName,
        contextWindow: meta.contextWindow,
        parameterCount: meta.parameterCount,
        quantization: meta.quantization,
        family: meta.family,
      });

      return meta;
    } catch (err: unknown) {
      lastError = err as Error;
      logger.warn("[ollama-meta] Failed to fetch model metadata", {
        modelName,
        attempt,
        error: lastError.message,
      });

      if (attempt < 2) {
        // Brief delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // Return minimal metadata on failure
  const fallback: OllamaModelMeta = {
    name: modelName,
    contextWindow: 0,
    parameterCount: 0,
    sizeBytes: 0,
  };

  // Cache fallback briefly to avoid hammering
  modelCache.set(cacheKey, { data: fallback, timestamp: Date.now() });

  throw lastError || new Error(`Failed to fetch model metadata for ${modelName}`);
}

/**
 * List all local models with their metadata.
 * @param ollamaHost - Optional Ollama host URL
 * @returns Array of model metadata
 */
export async function listLocalModels(ollamaHost?: string): Promise<OllamaModelMeta[]> {
  const baseUrl = ollamaHost || OLLAMA_CONFIG.baseUrl;

  try {
    logger.debug("[ollama-meta] Listing local models", { baseUrl });

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUTS.MODEL_FETCH),
    });

    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }

    const data = await response.json();
    const models = (data.models || []) as Array<{ name: string; size?: number }>;

    // Fetch metadata for each model in parallel (with some concurrency limit)
    const results = await Promise.allSettled(
      models.map((model) => getModelMeta(model.name, baseUrl))
    );

    const metas: OllamaModelMeta[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        metas.push(result.value);
      } else {
        logger.warn("[ollama-meta] Failed to get metadata for a model", {
          error: result.reason?.message,
        });
      }
    }

    return metas;
  } catch (err: unknown) {
    logger.error("[ollama-meta] Failed to list local models", { error: String(err) });
    return [];
  }
}

/**
 * Clear the in-memory model metadata cache.
 */
export function clearModelCache(): void {
  modelCache.clear();
  logger.debug("[ollama-meta] Cache cleared");
}

/**
 * Get cache stats for debugging.
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: modelCache.size,
    entries: Array.from(modelCache.keys()),
  };
}