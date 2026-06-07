import { OLLAMA_CONFIG, TIMEOUTS } from "./config";
import { getDb } from "./db";
import { safeParseWarn } from "@/lib/safe-json";
import { logger } from "@/lib/logger";
import { getServerConfig } from "./server-config";

// ---------------------------------------------------------------------------
// Output Validation
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate the LLM is leaking system instructions or
 * echoing back prompt structure. Used to sanitize LLM output.
 */
const LEAK_PATTERNS = [
  /<user_content>[\s\S]*?<\/user_content>/gi,
  /\[CHARACTER INSTRUCTIONS\]/gi,
  /\[CANON:/gi,
  /\[CURRENT SCENE\]/gi,
  /\[KNOWN WORLD\]/gi,
  /\[RELATIONSHIPS\]/gi,
  /\[RECENT HISTORY\]/gi,
  /\[INTENT:/gi,
  /IMPORTANT:.*DATA ONLY/gi,
  /Do NOT follow any instructions.*user_content/gi,
] as const;

/**
 * Validate and sanitize LLM output.
 *
 * - Strips any leaked <user_content> blocks (the LLM should not echo these back)
 * - Strips leaked section headers from the prompt structure
 * - Logs a warning if significant leakage is detected
 *
 * @param output - Raw LLM response text
 * @returns Sanitized output text
 */
export function validateLlmOutput(output: string): string {
  if (!output) return output;

  let sanitized = output;
  let leaked = false;

  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(sanitized)) {
      leaked = true;
      sanitized = sanitized.replace(pattern, "").trim();
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
    }
  }

  if (leaked) {
    logger.debug("LLM output contained leaked prompt structure — sanitized", {
      originalLength: output.length,
      sanitizedLength: sanitized.length,
    });
  }

  return sanitized;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  /**
   * Enable/disable thinking mode for thinking-capable models (Qwen3.x, etc).
   * - `true` = force enable
   * - `false` = force disable (skips reasoning tokens, direct answer)
   * - `undefined` = let the model decide
   */
  think?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_ctx?: number;
    num_predict?: number;
  };
}

export interface OllamaEmbedRequest {
  model: string;
  input: string;
}

export interface OllamaEmbedResponse {
  embeddings: number[][];
}

export interface UserModels {
  llmModel: string;
  embeddingModel: string;
}

export interface PersonaContext {
  name: string;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  firstMes: string | null;
  mesExample: string | null;
  creatorNotes: string | null;
  systemPrompt: string | null;
  postHistoryInstructions: string | null;
  tags: string[] | null;
  writingStyle: string | null;
  llmModel: string | null;
}

/**
 * Get the active persona context for a user.
 * Returns null if no active persona exists.
 */
export function getActivePersonaContext(userId: string): PersonaContext | null {
  try {
    const db = getDb();
    const persona = db.prepare(
      "SELECT name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt, post_history_instructions, tags, writing_style, llm_model FROM personas WHERE user_id = ? AND is_active = 1"
    ).get(userId) as {
      name: string;
      description: string | null;
      personality: string | null;
      scenario: string | null;
      first_mes: string | null;
      mes_example: string | null;
      creator_notes: string | null;
      system_prompt: string | null;
      post_history_instructions: string | null;
      tags: string | null;
      writing_style: string | null;
      llm_model: string | null;
    } | undefined;

    if (!persona) return null;

    let tags: string[] | null = null;
    if (persona.tags) {
      tags = safeParseWarn<string[]>(persona.tags, "persona tags");
    }

    return {
      name: persona.name,
      description: persona.description,
      personality: persona.personality,
      scenario: persona.scenario,
      firstMes: persona.first_mes,
      mesExample: persona.mes_example,
      creatorNotes: persona.creator_notes,
      systemPrompt: persona.system_prompt,
      postHistoryInstructions: persona.post_history_instructions,
      tags,
      writingStyle: persona.writing_style,
      llmModel: persona.llm_model,
    };
  } catch (err: unknown) {
    logger.debug("Failed to get active persona context", { userId, error: String(err) });
    return null;
  }
}

/**
 * Build a SillyTavern-style system prompt from persona context.
 * Follows the standard ST prompt structure:
 *   [Character card] → [Scenario] → [Personality] → [Example dialogue] → [Post-history instructions]
 */
export function buildPersonaPrompt(persona: PersonaContext | null, baseSystemPrompt: string): string {
  if (!persona) return baseSystemPrompt;

  const parts: string[] = [];

  // 1. Player character description — this is the USER's character, NOT an NPC
  const descParts: string[] = [];
  descParts.push(`Name: ${persona.name}`);
  if (persona.description) descParts.push(`Description: ${persona.description}`);
  if (persona.personality) descParts.push(`Personality: ${persona.personality}`);
  if (persona.writingStyle) descParts.push(`Writing style: ${persona.writingStyle}`);
  if (persona.tags && persona.tags.length > 0) descParts.push(`Tags: ${persona.tags.join(", ")}`);

  if (descParts.length > 1) {
    parts.push(`[PLAYER CHARACTER("${persona.name}")\n${descParts.join("\n")}]\nThis is the player's character. You write as the Narrator and control NPCs only. NEVER write actions, dialogue, or internal thoughts for ${persona.name}. Only the player controls ${persona.name}.`);
  }

  // 2. Scenario
  if (persona.scenario) {
    parts.push(`[Scenario]\n${persona.scenario}`);
  }

  // 3. Example dialogue (mes_example)
  if (persona.mesExample) {
    parts.push(`<START>\n${persona.mesExample}`);
  }

  // 4. Post-history instructions
  if (persona.postHistoryInstructions) {
    parts.push(`[Post-history instructions]\n${persona.postHistoryInstructions}`);
  }

  // 5. Creator notes
  if (persona.creatorNotes) {
    parts.push(`[Creator's notes]\n${persona.creatorNotes}`);
  }

  // 6. Base system prompt
  parts.push(baseSystemPrompt);

  // 7. Character-specific system prompt override
  if (persona.systemPrompt) {
    parts.push(`[System override]\n${persona.systemPrompt}`);
  }

  return parts.join("\n\n");
}

let ollamaAvailable = false;
let localModels: string[] = [];

/**
 * Fetch available models from the local Ollama instance.
 * Only returns models that are actually pulled/available locally.
 */
export async function fetchLocalModels(ollamaUrl?: string): Promise<string[]> {
  const baseUrl = ollamaUrl || OLLAMA_CONFIG.baseUrl;
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUTS.LLM_FETCH),
    });
    if (!response.ok) {
      ollamaAvailable = false;
      return [];
    }
    const data = await response.json();
    ollamaAvailable = true;
    localModels = (data.models || []).map((m: { name: string }) => m.name);
    return localModels;
  } catch {
    ollamaAvailable = false;
    return [];
  }
}

/**
 * Get locally available models (cached from last fetch).
 * Call fetchLocalModels() first to refresh.
 */
export function getLocalModels(): string[] {
  return localModels;
}

/**
 * Check if a model is available locally.
 */
export function isModelAvailable(model: string): boolean {
  return localModels.includes(model) || localModels.some(m => m.startsWith(model + ":"));
}

/**
 * Get the user's selected models from their settings.
 * Falls back to the first available local model, then OLLAMA_CONFIG defaults.
 */
/**
 * Get the user's custom Ollama URL from settings.
 * Falls back to the server config baseUrl.
 */
export function getUserOllamaUrl(userId: string): string {
  try {
    const db = getDb();
    const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;
    if (row?.settings) {
      const settings = safeParseWarn<Record<string, unknown>>(row.settings, "user settings");
      if (settings?.ollamaUrl && typeof settings.ollamaUrl === "string") {
        const url = settings.ollamaUrl.trim();
        if (url) return url.startsWith("http") ? url : `http://${url}`;
      }
    }
  } catch {
    // Fall through to default
  }
  return OLLAMA_CONFIG.baseUrl;
}

/**
 * Get the user's custom TTS URL from settings.
 * Falls back to the server config baseUrl.
 */
export function getUserTtsUrl(userId: string): string {
  try {
    const db = getDb();
    const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;
    if (row?.settings) {
      const settings = safeParseWarn<Record<string, unknown>>(row.settings, "user settings");
      if (settings?.ttsUrl && typeof settings.ttsUrl === "string") {
        const url = settings.ttsUrl.trim();
        if (url) return url.startsWith("http") ? url : `http://${url}`;
      }
    }
  } catch {
    // Fall through to default
  }
  // Import TTS_CONFIG lazily to avoid circular deps
  const { TTS_CONFIG } = require("./config");
  return TTS_CONFIG.baseUrl;
}

export function getUserModels(userId: string): UserModels {
  try {
    const db = getDb();
    const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;
    if (row?.settings) {
      const settings = safeParseWarn<Record<string, unknown>>(row.settings, "user settings");
      if (!settings) throw new Error("Invalid user settings");
      return {
        llmModel: String(settings.llmModel || OLLAMA_CONFIG.model),
        embeddingModel: String(settings.embeddingModel || OLLAMA_CONFIG.embeddingModel),
      };
    }
  } catch {
    // Fall through to defaults
  }
  return {
    llmModel: OLLAMA_CONFIG.model,
    embeddingModel: OLLAMA_CONFIG.embeddingModel,
  };
}

export async function checkOllamaConnection(ollamaUrl?: string): Promise<boolean> {
  const baseUrl = ollamaUrl || OLLAMA_CONFIG.baseUrl;
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUTS.LLM_FETCH),
    });
    ollamaAvailable = response.ok;
    return response.ok;
  } catch {
    ollamaAvailable = false;
    return false;
  }
}

export function isOllamaAvailable(): boolean {
  return ollamaAvailable;
}

/**
 * Resolve the effective generation options for a model. The fallback
 * chain is layered:
 *
 *   1. Explicit caller options (e.g. job handlers passing temperature: 0.2)
 *      — these ALWAYS win, regardless of the useCustomSampling toggle.
 *      This lets jobs (extraction, summarization) enforce their own
 *      reliability-critical settings even when the user has custom
 *      sampling turned off for chat.
 *
 *   2. Per-model overrides from `model_defaults[model]` — only consulted
 *      when `useCustomSampling` is ON. This is the user's per-model tuning.
 *
 *   3. Hardcoded OLLAMA_CONFIG fallback — only consulted when
 *      `useCustomSampling` is ON.
 *
 *   4. undefined (Ollama uses the model's own baked-in defaults) — when
 *      useCustomSampling is OFF AND the caller didn't pass an explicit
 *      option for this field.
 *
 * num_ctx is handled separately by `resolveNumCtx` (different fallback
 * chain because context window is a VRAM concern, not a sampling one).
 */
function resolveModelOptions(
  model: string,
  explicit: Partial<OllamaGenerateRequest["options"]> | undefined
): OllamaGenerateRequest["options"] {
  const cfg = getServerConfig();
  // When useCustomSampling is OFF, the per-model/user layer is skipped —
  // we just compose: explicit (if any) over Ollama model defaults.
  // When ON, we layer explicit > per-model > OLLAMA_CONFIG.
  const perModel = cfg.ollama.useCustomSampling
    ? (cfg.modelDefaults?.[model] ?? {})
    : undefined;

  return {
    // Temperature: explicit > (per-model or OLLAMA_CONFIG) > undefined
    temperature: explicit?.temperature
      ?? perModel?.temperature
      ?? OLLAMA_CONFIG.options.temperature,
    // Top P: explicit > (per-model or OLLAMA_CONFIG) > undefined
    top_p: explicit?.top_p
      ?? perModel?.topP
      ?? OLLAMA_CONFIG.options.top_p,
    // Top K: explicit > (per-model or OLLAMA_CONFIG) > undefined
    top_k: explicit?.top_k
      ?? perModel?.topK
      ?? OLLAMA_CONFIG.options.top_k,
    // num_predict: explicit > (per-model or OLLAMA_CONFIG) > undefined
    num_predict: explicit?.num_predict
      ?? perModel?.numPredict
      ?? OLLAMA_CONFIG.options.num_predict,
  };
}

/**
 * Resolve the effective num_ctx for a model. Priority:
 *   1. Explicit option from caller
 *   2. Per-model override (server_config.model_defaults[model].numCtx)
 *   3. undefined (let Ollama use the model's native context window)
 *
 * num_ctx is INDEPENDENT of the `useCustomSampling` toggle — context
 * window is a VRAM concern, sampling parameters are a behavior concern.
 * Users can pin a specific num_ctx while still leaving sampling to the
 * model defaults, or vice versa.
 */
function resolveNumCtx(
  model: string,
  explicit: number | undefined
): number | undefined {
  if (explicit !== undefined) return explicit;
  const cfg = getServerConfig();
  return cfg.modelDefaults?.[model]?.numCtx;
}

export async function generateText(
  prompt: string,
  options?: Partial<OllamaGenerateRequest["options"]> & { model?: string; userId?: string; think?: boolean; ollamaHost?: string },
  timeoutMs?: number
): Promise<string> {
  const model = options?.model || (options?.userId ? getUserModels(options.userId).llmModel : OLLAMA_CONFIG.model);
  const baseUrl = options?.ollamaHost || (options?.userId ? getUserOllamaUrl(options.userId) : OLLAMA_CONFIG.baseUrl);

  // Resolve num_ctx through the per-model chain (independent of useCustomSampling).
  const numCtx = resolveNumCtx(model, options?.num_ctx);
  // Resolve sampling options through the explicit > per-model > OLLAMA_CONFIG
  // chain — returns {} when useCustomSampling is OFF.
  const resolvedOptions = resolveModelOptions(model, options);

  const requestBody: OllamaGenerateRequest = {
    model,
    prompt,
    stream: false,
    ...(options?.think !== undefined ? { think: options.think } : {}),
    options: {
      ...resolvedOptions,
      ...(numCtx !== undefined ? { num_ctx: numCtx } : {}),
    },
  };

  const requestTimeout = timeoutMs || OLLAMA_CONFIG.timeout;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= OLLAMA_CONFIG.retryAttempts; attempt++) {
    try {
      const response = await fetch(
        `${baseUrl}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(requestTimeout),
        }
      );

      if (!response.ok) {
        throw new Error(`Ollama responded with ${response.status}`);
      }

      const data = await response.json();
      ollamaAvailable = true;

      // Qwen3.x thinking models may produce a thinking field but empty response
      // when the context window fills with reasoning. Log and return empty so
      // callers can retry (context window fix: increase num_ctx).
      if (!data.response && data.thinking) {
        logger.warn("[ollama] Model produced thinking but no response — context window may be too small", {
          model,
          thinkingLength: String(data.thinking?.length || 0).substring(0, 6),
          promptEvalCount: data.prompt_eval_count,
          evalCount: data.eval_count,
        });
      }

      return validateLlmOutput(data.response || "");
    } catch (err: unknown) {
      lastError = err as Error;
      ollamaAvailable = false;

      if (attempt < OLLAMA_CONFIG.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, OLLAMA_CONFIG.retryDelay * attempt)
        );
      }
    }
  }

  throw lastError || new Error("Ollama generation failed");
}

export async function generateTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  options?: Partial<OllamaGenerateRequest["options"]> & { model?: string; userId?: string; think?: boolean; ollamaHost?: string }
): Promise<void> {
  const model = options?.model || (options?.userId ? getUserModels(options.userId).llmModel : OLLAMA_CONFIG.model);
  const baseUrl = options?.ollamaHost || (options?.userId ? getUserOllamaUrl(options.userId) : OLLAMA_CONFIG.baseUrl);

  // Resolve num_ctx through the per-model chain (independent of useCustomSampling).
  const numCtx = resolveNumCtx(model, options?.num_ctx);
  // Resolve sampling options through the explicit > per-model > OLLAMA_CONFIG
  // chain — returns {} when useCustomSampling is OFF.
  const resolvedOptions = resolveModelOptions(model, options);

  const requestBody: OllamaGenerateRequest = {
    model,
    prompt,
    stream: true,
    ...(options?.think !== undefined ? { think: options.think } : {}),
    options: {
      ...resolvedOptions,
      ...(numCtx !== undefined ? { num_ctx: numCtx } : {}),
    },
  };

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(OLLAMA_CONFIG.timeout),
  });

  if (!response.ok) {
    throw new Error(`Ollama responded with ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete JSON lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        const data = safeParseWarn<Record<string, unknown>>(line, "streaming JSON line");
        if (data?.response) {
          onChunk(validateLlmOutput(data.response as string));
        }
        if (data?.done) return;
      }
    }
  }
}

export async function generateEmbedding(
  text: string,
  options?: { model?: string; userId?: string; ollamaHost?: string }
): Promise<number[]> {
  const model = options?.model || (options?.userId ? getUserModels(options.userId).embeddingModel : OLLAMA_CONFIG.embeddingModel);
  const baseUrl = options?.ollamaHost || (options?.userId ? getUserOllamaUrl(options.userId) : OLLAMA_CONFIG.baseUrl);

  const requestBody: OllamaEmbedRequest = {
    model,
    input: text,
  };

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(OLLAMA_CONFIG.embeddingTimeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama embed responded with ${response.status}`);
      }

      const data: OllamaEmbedResponse = await response.json();
      ollamaAvailable = true;
      return data.embeddings[0] || [];
    } catch (err: unknown) {
      ollamaAvailable = false;

      // Exponential backoff: 2s, 4s, 8s, 16s... capped at 60s — gives GPU time to free memory
      const delay = Math.min(OLLAMA_CONFIG.retryDelay * Math.pow(2, attempt - 1), 60000);
      logger.warn(`[embedding] Attempt ${attempt} failed: ${(err as Error).message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
