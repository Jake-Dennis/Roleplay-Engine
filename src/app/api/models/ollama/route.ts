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
 * Fetch available Ollama models from the user's Ollama URL (or server default).
 * Returns connection status, all model details, and the server-configured defaults.
 * Embedding models are not filtered — the user picks what works for embeddings.
 *
 * @param request - The incoming Next.js request object
 * @query url - Optional custom Ollama URL to query (e.g. http://192.168.4.2:11434)
 * @returns NextResponse with { connected, host, models, defaultLLM, defaultEmbedding }
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

  // Use provided URL or fetch from user settings, then fall back to server config
  const customUrl = request.nextUrl.searchParams.get("url")?.trim();
  let ollamaUrl: string;
  if (customUrl) {
    ollamaUrl = customUrl.startsWith("http") ? customUrl : `http://${customUrl}`;
  } else {
    const { getUserOllamaUrl } = await import("@/lib/ollama");
    ollamaUrl = getUserOllamaUrl(userId);
  }

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
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

    // Return ALL models — no categorization filter.
    // The user picks which model to use for LLM and which for embeddings.
    return NextResponse.json({
      connected: true,
      host: ollamaUrl,
      models: models.map((m: OllamaModelInfo) => ({
        name: m.name,
        size: m.size,
        parameterSize: m.details?.parameter_size || "unknown",
        family: m.details?.family || "unknown",
        quantization: m.details?.quantization_level || "unknown",
        modifiedAt: m.modified_at,
      })),
      defaultLLM: OLLAMA_CONFIG.model,
      defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to connect to Ollama",
        connected: false,
        host: ollamaUrl,
        models: [],
        defaultLLM: OLLAMA_CONFIG.model,
        defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
      },
      { status: 502 }
    );
  }
}
