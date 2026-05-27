import { NextRequest, NextResponse } from "next/server";
import { OLLAMA_CONFIG, TIMEOUTS } from "@/lib/config";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * GET /api/models/ollama
 * Fetch available Ollama models, categorized into LLM and embedding models.
 * Returns connection status, model details, and configured defaults.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { connected, host, models, llmModels, embeddingModels, defaultLLM, defaultEmbedding }
 * @throws 401 - If authentication fails
 * @throws 502 - If Ollama is unreachable or responds with an error
 * @throws 429 - If rate limit exceeded
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUTS.MODEL_FETCH),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Ollama responded with ${response.status}`, connected: false },
        { status: 502 }
      );
    }

    const data = await response.json();
    const models: OllamaModelInfo[] = data.models || [];

    // Categorize models by type
    const llmModels = models.filter((m: OllamaModelInfo) => {
      const name = m.name.toLowerCase();
      // Exclude known embedding-only models
      const embeddingModels = ["bge-m3", "bge-large", "nomic-embed", "all-minilm", "snowflake-arctic-embed"];
      return !embeddingModels.some((em) => name.includes(em));
    });

    const embeddingModels = models.filter((m: OllamaModelInfo) => {
      const name = m.name.toLowerCase();
      const embeddingKeywords = ["bge", "nomic-embed", "all-minilm", "snowflake-arctic-embed", "embed"];
      return embeddingKeywords.some((kw) => name.includes(kw));
    });

    // If no embedding models found, include known embedding models that might be available
    const allEmbeddingModels = embeddingModels.length > 0
      ? embeddingModels
      : models.filter((m: OllamaModelInfo) => {
          const name = m.name.toLowerCase();
          return name.includes("bge") || name.includes("embed");
        });

    return NextResponse.json({
      connected: true,
      host: `${OLLAMA_CONFIG.host}:${OLLAMA_CONFIG.port}`,
      models: models.map((m: OllamaModelInfo) => ({
        name: m.name,
        size: m.size,
        parameterSize: m.details?.parameter_size || "unknown",
        family: m.details?.family || "unknown",
        quantization: m.details?.quantization_level || "unknown",
        modifiedAt: m.modified_at,
      })),
      llmModels: llmModels.map((m: OllamaModelInfo) => ({
        name: m.name,
        parameterSize: m.details?.parameter_size || "unknown",
        family: m.details?.family || "unknown",
      })),
      embeddingModels: allEmbeddingModels.map((m: OllamaModelInfo) => ({
        name: m.name,
        parameterSize: m.details?.parameter_size || "unknown",
      })),
      defaultLLM: OLLAMA_CONFIG.model,
      defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to connect to Ollama",
        connected: false,
        host: `${OLLAMA_CONFIG.host}:${OLLAMA_CONFIG.port}`,
        models: [],
        llmModels: [],
        embeddingModels: [],
        defaultLLM: OLLAMA_CONFIG.model,
        defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
      },
      { status: 502 }
    );
  }
}
