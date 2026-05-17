import { OLLAMA_CONFIG } from "./config";
import { getDb } from "./db";

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

let ollamaAvailable = false;
let localModels: string[] = [];

/**
 * Fetch available models from the local Ollama instance.
 * Only returns models that are actually pulled/available locally.
 */
export async function fetchLocalModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
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
      const settings = JSON.parse(row.settings);
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
      signal: AbortSignal.timeout(5000),
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
      return data.response || "";
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
        try {
          const data = JSON.parse(line);
          if (data.response) {
            onChunk(data.response);
          }
          if (data.done) return;
        } catch {
          // Skip malformed JSON
        }
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
