import { request, Dispatcher } from "undici";
import { OLLAMA_CONFIG, TIMEOUTS, TTS_CONFIG } from "./config";
import { getDb } from "./db";
import { safeParseWarn } from "@/lib/safe-json";
import { logger } from "@/lib/logger";
import { getServerConfig } from "./server-config";

// ---------------------------------------------------------------------------
// Custom HTTP transport — bypasses Next.js's patched fetch()
// ---------------------------------------------------------------------------
//
// Next.js wraps globalThis.fetch with its own caching/dedup logic. When
// fetch() passes through this wrapper, the `dispatcher` option (which we
// used to pass a custom Agent with relaxed timeouts) may be stripped.
// Even setGlobalDispatcher() is unreliable because Next.js/Turbopack
// caches module evaluation — the setGlobalDispatcher call may never run.
//
// Solution: use undici.request() directly. This is the low-level API
// that underlies fetch() but accepts headersTimeout/bodyTimeout directly
// in the options, bypassing the global dispatcher entirely. It always
// works regardless of what Next.js does to globalThis.fetch.

/**
 * Convert a Node.js Readable stream to a web ReadableStream.
 * Required because undici.request() returns Node.js streams internally,
 * but generateTextStream expects response.body.getReader().
 */
function nodeToWeb<T extends Uint8Array>(nodeStream: NodeJS.ReadableStream): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer | string) => {
        controller.enqueue(
          (typeof chunk === "string" ? Buffer.from(chunk) : chunk) as T
        );
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
  });
}

/**
 * Execute an HTTP request to Ollama using undici.request() directly,
 * bypassing Next.js's patched fetch(). Returns a standard Response
 * object so the rest of the code doesn't need to change.
 *
 * Timeouts (headersTimeout, bodyTimeout) are passed directly to the
 * undici Dispatcher, which means they are ALWAYS respected regardless
 * of the global dispatcher or Next.js fetch patching.
 */
async function ollamaFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
  streamResponse?: boolean
): Promise<Response> {
  // Determine effective timeout — use the request's AbortSignal timeout
  // duration as the undici timeout ceiling, or fall back to the config.
  const signalTimeout = init?.signal
    ? "timeout" in init.signal
      ? (init.signal as AbortSignal & { timeout?: number }).timeout
      : undefined
    : undefined;
  const effectiveTimeout = signalTimeout ?? OLLAMA_CONFIG.timeout;

  const undiciOptions: Dispatcher.RequestOptions = {
    method: (init?.method || "GET") as Dispatcher.HttpMethod,
    headers: init?.headers as Record<string, string>,
    body: init?.body,
    signal: init?.signal,
    headersTimeout: effectiveTimeout,
    bodyTimeout: effectiveTimeout,
  };

  const responseData = await request(url, undiciOptions);

  if (streamResponse) {
    // Streaming case: wrap the Node.js Readable as a web ReadableStream
    const webStream = nodeToWeb(responseData.body);
    return new Response(webStream, {
      status: responseData.statusCode,
      statusText: responseData.statusCode === 200 ? "OK" : "Error",
    });
  }

  // Non-streaming case: buffer the full body
  const chunks: Buffer[] = [];
  for await (const chunk of responseData.body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  return new Response(body, {
    status: responseData.statusCode,
    statusText: responseData.statusCode === 200 ? "OK" : "Error",
  });
}

/** Convenience: non-streaming GET */
function ollamaGet(url: string, signal?: AbortSignal): Promise<Response> {
  return ollamaFetch(url, { method: "GET", signal });
}

/** Convenience: non-streaming POST */
function ollamaPost(
  url: string,
  body: string,
  signal?: AbortSignal
): Promise<Response> {
  return ollamaFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    }
  );
}

/** Convenience: streaming POST */
function ollamaPostStream(
  url: string,
  body: string,
  signal?: AbortSignal
): Promise<Response> {
  return ollamaFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    },
    true // streamResponse
  );
}

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
    logger.debug("LLM output contained leaked prompt structure â€” sanitized", {
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
 *   [Character card] â†’ [Scenario] â†’ [Personality] â†’ [Example dialogue] â†’ [Post-history instructions]
 */
export function buildPersonaPrompt(persona: PersonaContext | null, baseSystemPrompt: string): string {
  if (!persona) return baseSystemPrompt;

  const parts: string[] = [];

  // 1. Player character description â€” this is the USER's character, NOT an NPC
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
    const response = await ollamaGet(
      `${baseUrl}/api/tags`,
      AbortSignal.timeout(TIMEOUTS.LLM_FETCH)
    );
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
 * Validate that a service URL does not point to a dangerous internal address.
 *
 * Denylist (rejected):
 *   - 127.0.0.0/8 (IPv4 loopback)
 *   - ::1 (IPv6 loopback)
 *   - 0.0.0.0 (all interfaces)
 *   - 169.254.169.254 (cloud metadata endpoint)
 *
 * All other hostnames (DNS names, private IPs like 10.x.x.x, 172.16.x.x,
 * 192.168.x.x) are allowed - this is a self-hosted app where users
 * control their own infrastructure and may need to point to LAN addresses.
 *
 * @param url - The full URL to validate (e.g. "http://192.168.1.50:11434")
 * @returns true if the URL is safe to use, false otherwise
 */
export function isValidServiceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname;

    // Strip brackets for IPv6 address processing (Bun's URL parser
    // returns bracketed IPv6 hostnames, e.g. "[::ffff:7f00:1]").
    const cleanedHostname = hostname.replace(/^\[|\]$/g, "");

    // IPv6 loopback
    if (cleanedHostname === "::1") {
      return false;
    }

    // Check for IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1).
    // Some runtimes (Node.js) preserve the dotted-decimal form while
    // others (Bun) hex-encode it as two 16-bit groups (::ffff:7f00:1).
    if (cleanedHostname.startsWith("::ffff:")) {
      const embedded = cleanedHostname.slice(7); // Remove "::ffff:"

      // Dotted-decimal format (Node.js style)
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(embedded)) {
        if (embedded.startsWith("127.")) return false;
        if (embedded === "0.0.0.0") return false;
        if (embedded === "169.254.169.254") return false;
      }

      // Hex-encoded format (Bun style: two 16-bit groups like 7f00:1)
      const hexMatch = embedded.match(/^([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})$/);
      if (hexMatch) {
        const high = parseInt(hexMatch[1], 16);
        const low = parseInt(hexMatch[2], 16);
        const ipv4 = `${(high >> 8) & 0xFF}.${high & 0xFF}.${(low >> 8) & 0xFF}.${low & 0xFF}`;
        if (ipv4.startsWith("127.")) return false;
        if (ipv4 === "0.0.0.0") return false;
        if (ipv4 === "169.254.169.254") return false;
      }

      // Non-denylisted ::ffff: addresses are allowed (e.g. 10.0.0.1, 192.168.x.x)
    }

    // Check if hostname is a plain IPv4 address
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      if (hostname.startsWith("127.")) return false;
      if (hostname === "0.0.0.0") return false;
      if (hostname === "169.254.169.254") return false;
    }

    // All other hostnames are allowed (DNS names, LAN IPs, etc.)
    return true;
  } catch {
    // URL could not be parsed
    return false;
  }
}

/**
 * Get the configured Ollama service URL.
 * Reads from the server-wide config (which merges DB overrides, env vars,
 * and hardcoded defaults) instead of per-user settings.
 *
 * The userId parameter is accepted for backwards compatibility with existing
 * callers, but per-user Ollama URLs are no longer supported — infrastructure
 * URLs (Ollama, TTS) are server-wide settings only.
 *
 * Validates the URL against a denylist to prevent SSRF attacks.
 */
export function getUserOllamaUrl(_userId?: string): string {
  try {
    const cfg = getServerConfig();
    const url = `http://${cfg.ollama.host}:${cfg.ollama.port}`;
    if (isValidServiceUrl(url)) return url;
  } catch {
    // Fall through to default
  }
  return OLLAMA_CONFIG.baseUrl;
}

/**
 * Get the configured TTS service URL.
 * Reads from the server-wide config (which merges DB overrides, env vars,
 * and hardcoded defaults) instead of per-user settings.
 *
 * The userId parameter is accepted for backwards compatibility with existing
 * callers, but per-user TTS URLs are no longer supported — infrastructure
 * URLs (Ollama, TTS) are server-wide settings only.
 *
 * Validates the URL against a denylist to prevent SSRF attacks.
 */
export function getUserTtsUrl(_userId?: string): string {
  try {
    const cfg = getServerConfig();
    const url = `http://${cfg.tts.host}:${cfg.tts.port}`;
    if (isValidServiceUrl(url)) return url;
  } catch {
    // Fall through to default
  }
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

/**
 * Resolve the model that background jobs should use for a given user.
 * Falls back to the user's chat model when the `useJobsModel` toggle is
 * off OR when no job model is configured. Per-model settings cascade
 * automatically because `resolveModelOptions`/`resolveNumCtx` look up
 * `model_defaults[model]` by name.
 */
export function getActiveJobModel(userId: string): string {
  const cfg = getServerConfig();
  if (cfg.ollama.useJobsModel && cfg.ollama.jobModel) {
    return cfg.ollama.jobModel;
  }
  return getUserModels(userId).llmModel;
}

export async function checkOllamaConnection(ollamaUrl?: string): Promise<boolean> {
  const baseUrl = ollamaUrl || OLLAMA_CONFIG.baseUrl;
  try {
    const response = await ollamaGet(
      `${baseUrl}/api/tags`,
      AbortSignal.timeout(TIMEOUTS.LLM_FETCH)
    );
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
 * Check if a specific model is available on the Ollama server.
 * Fetches the model list via /api/tags (fast, ~3s timeout) and checks
 * for an exact match. Used as a pre-flight check before generation to
 * fail fast instead of waiting for the 10-minute generation timeout.
 *
 * @param modelName - The model name to check (e.g. "qwen3.5:9b")
 * @param ollamaUrl - Optional custom Ollama URL (defaults to OLLAMA_CONFIG.baseUrl)
 * @returns true if the model is available, false otherwise
 */
export async function checkModelAvailable(
  modelName: string,
  ollamaUrl?: string
): Promise<boolean> {
  const baseUrl = ollamaUrl || OLLAMA_CONFIG.baseUrl;
  try {
    const response = await ollamaGet(
      `${baseUrl}/api/tags`,
      AbortSignal.timeout(TIMEOUTS.LLM_FETCH)
    );
    if (!response.ok) return false;

    const data = await response.json();
    const models: { name: string }[] = data.models || [];
    // Ollama lists models with tags like "qwen3.5:9b" — match against the
    // user-facing name (case-insensitive for user-friendly matching).
    return models.some(
      (m) => m.name.toLowerCase() === modelName.toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the effective generation options for a model. The fallback
 * chain is layered:
 *
 *   1. Explicit caller options (e.g. job handlers passing temperature: 0.2)
 *      â€” these ALWAYS win, regardless of the useCustomSampling toggle.
 *      This lets jobs (extraction, summarization) enforce their own
 *      reliability-critical settings even when the user has custom
 *      sampling turned off for chat.
 *
 *   2. Per-model overrides from `model_defaults[model]` â€” only consulted
 *      when `useCustomSampling` is ON. This is the user's per-model tuning.
 *
 *   3. Hardcoded OLLAMA_CONFIG fallback â€” only consulted when
 *      `useCustomSampling` is ON.
 *
 *   4. undefined (Ollama uses the model's own baked-in defaults) â€” when
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
  // When useCustomSampling is OFF, the per-model/user layer is skipped â€”
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
 * num_ctx is INDEPENDENT of the `useCustomSampling` toggle â€” context
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
  // chain â€” returns {} when useCustomSampling is OFF.
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
      const response = await ollamaPost(
        `${baseUrl}/api/generate`,
        JSON.stringify(requestBody),
        AbortSignal.timeout(requestTimeout)
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
        logger.warn("[ollama] Model produced thinking but no response â€” context window may be too small", {
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
  // chain â€” returns {} when useCustomSampling is OFF.
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

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= OLLAMA_CONFIG.retryAttempts; attempt++) {
    try {
      const response = await ollamaPostStream(
        `${baseUrl}/api/generate`,
        JSON.stringify(requestBody),
        AbortSignal.timeout(OLLAMA_CONFIG.timeout)
      );

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
      return; // Stream completed successfully
    } catch (err: unknown) {
      ollamaAvailable = false;
      lastError = err as Error;

      if (attempt < OLLAMA_CONFIG.retryAttempts) {
        logger.warn(`[stream] Attempt ${attempt} failed: ${lastError.message}. Retrying in ${OLLAMA_CONFIG.retryDelay * attempt}ms...`);
        await new Promise((resolve) => setTimeout(resolve, OLLAMA_CONFIG.retryDelay * attempt));
      }
    }
  }

  throw lastError || new Error("Ollama stream generation failed");
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

  const maxEmbeddingRetries = 5;
  for (let attempt = 1; attempt <= maxEmbeddingRetries; attempt++) {
    try {
      const response = await ollamaPost(
        `${baseUrl}/api/embed`,
        JSON.stringify(requestBody),
        AbortSignal.timeout(OLLAMA_CONFIG.embeddingTimeout)
      );

      if (!response.ok) {
        throw new Error(`Ollama embed responded with ${response.status}`);
      }

      const data: OllamaEmbedResponse = await response.json();
      ollamaAvailable = true;
      return data.embeddings[0] || [];
    } catch (err: unknown) {
      ollamaAvailable = false;

      if (attempt < maxEmbeddingRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s... capped at 60s — gives GPU time to free memory
        const delay = Math.min(OLLAMA_CONFIG.retryDelay * Math.pow(2, attempt - 1), 60000);
        logger.warn(`[embedding] Attempt ${attempt} failed: ${(err as Error).message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error(`[embedding] All ${maxEmbeddingRetries} attempts failed`, { error: (err as Error).message });
        throw err;
      }
    }
  }
  throw new Error("Embedding generation failed after all retries");
}
