import { OLLAMA_CONFIG, TIMEOUTS } from "./config";
import { getDb } from "./db";
import { safeParseWarn } from "@/lib/safe-json";
import { logger } from "@/lib/logger";

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
  options?: {
    temperature?: number;
    top_p?: number;
    num_ctx?: number;
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
  } catch (err) {
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

  // 1. Character description (SillyTavern style)
  const descParts: string[] = [];
  descParts.push(`Name: ${persona.name}`);
  if (persona.description) descParts.push(`Description: ${persona.description}`);
  if (persona.personality) descParts.push(`Personality: ${persona.personality}`);
  if (persona.writingStyle) descParts.push(`Writing style: ${persona.writingStyle}`);
  if (persona.tags && persona.tags.length > 0) descParts.push(`Tags: ${persona.tags.join(", ")}`);

  if (descParts.length > 1) {
    parts.push(`[Character("${persona.name}")\n${descParts.join("\n")}]`);
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
export async function fetchLocalModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
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
export function getUserModels(userId: string): UserModels {
  try {
    const db = getDb();
    const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;
    if (row?.settings) {
      const settings = safeParseWarn<Record<string, string>>(row.settings, "user settings");
      if (!settings) throw new Error("Invalid user settings");
      return {
        llmModel: settings.llmModel || OLLAMA_CONFIG.model,
        embeddingModel: settings.embeddingModel || OLLAMA_CONFIG.embeddingModel,
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

export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
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

export async function generateText(
  prompt: string,
  options?: Partial<OllamaGenerateRequest["options"]> & { model?: string; userId?: string }
): Promise<string> {
  const model = options?.model || (options?.userId ? getUserModels(options.userId).llmModel : OLLAMA_CONFIG.model);

  const requestBody: OllamaGenerateRequest = {
    model,
    prompt,
    stream: false,
    options: {
      ...OLLAMA_CONFIG.options,
      temperature: options?.temperature ?? OLLAMA_CONFIG.options.temperature,
      top_p: options?.top_p ?? OLLAMA_CONFIG.options.top_p,
      num_ctx: options?.num_ctx ?? OLLAMA_CONFIG.options.num_ctx,
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= OLLAMA_CONFIG.retryAttempts; attempt++) {
    try {
      const response = await fetch(
        `${OLLAMA_CONFIG.baseUrl}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(OLLAMA_CONFIG.timeout),
        }
      );

      if (!response.ok) {
        throw new Error(`Ollama responded with ${response.status}`);
      }

      const data = await response.json();
      ollamaAvailable = true;
      return validateLlmOutput(data.response || "");
    } catch (error) {
      lastError = error as Error;
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
  options?: Partial<OllamaGenerateRequest["options"]> & { model?: string; userId?: string }
): Promise<void> {
  const model = options?.model || (options?.userId ? getUserModels(options.userId).llmModel : OLLAMA_CONFIG.model);

  const requestBody: OllamaGenerateRequest = {
    model,
    prompt,
    stream: true,
    options: {
      ...OLLAMA_CONFIG.options,
      temperature: options?.temperature ?? OLLAMA_CONFIG.options.temperature,
      top_p: options?.top_p ?? OLLAMA_CONFIG.options.top_p,
      num_ctx: options?.num_ctx ?? OLLAMA_CONFIG.options.num_ctx,
    },
  };

  const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
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
  options?: { model?: string; userId?: string }
): Promise<number[]> {
  const model = options?.model || (options?.userId ? getUserModels(options.userId).embeddingModel : OLLAMA_CONFIG.embeddingModel);

  const requestBody: OllamaEmbedRequest = {
    model,
    input: text,
  };

  const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(OLLAMA_CONFIG.embeddingTimeout),
  });

  if (!response.ok) {
    throw new Error(`Ollama embed responded with ${response.status}`);
  }

  const data: OllamaEmbedResponse = await response.json();
  return data.embeddings[0] || [];
}
