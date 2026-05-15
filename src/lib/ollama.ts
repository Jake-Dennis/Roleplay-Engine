import { OLLAMA_CONFIG } from "./config";

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

let ollamaAvailable = false;

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
  options?: Partial<OllamaGenerateRequest["options"]>
): Promise<string> {
  const requestBody: OllamaGenerateRequest = {
    model: OLLAMA_CONFIG.model,
    prompt,
    stream: false,
    options: {
      ...OLLAMA_CONFIG.options,
      ...options,
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
  options?: Partial<OllamaGenerateRequest["options"]>
): Promise<void> {
  const requestBody: OllamaGenerateRequest = {
    model: OLLAMA_CONFIG.model,
    prompt,
    stream: true,
    options: {
      ...OLLAMA_CONFIG.options,
      ...options,
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

export async function generateEmbedding(text: string): Promise<number[]> {
  const requestBody: OllamaEmbedRequest = {
    model: OLLAMA_CONFIG.embeddingModel,
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
