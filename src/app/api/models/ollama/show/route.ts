import { NextRequest, NextResponse } from "next/server";
import { getUserOllamaUrl } from "@/lib/ollama";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { TIMEOUTS } from "@/lib/config";

/**
 * GET /api/models/ollama/show
 * Fetch Ollama model details including the native context window.
 * Uses Ollama's /api/show endpoint to read model_info.
 *
 * @param request - expects ?model=modelname
 * @returns { contextWindow: number, model: string }
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const model = request.nextUrl.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "model query param required" }, { status: 400 });
  }

  const ollamaUrl = getUserOllamaUrl(userId);

  try {
    const response = await fetch(`${ollamaUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(TIMEOUTS.LLM_FETCH),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Ollama responded with ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const modelInfo = data?.model_info || {};

    // Extract context window from model_info
    const contextWindow = modelInfo["num_ctx"] || modelInfo["context_length"] || modelInfo["n_ctx"] || null;

    return NextResponse.json({
      model,
      contextWindow: typeof contextWindow === "number" ? contextWindow : (typeof contextWindow === "string" ? parseInt(contextWindow, 10) || null : null),
      parameterSize: data?.details?.parameter_size || null,
      family: data?.details?.family || null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch model info", contextWindow: null }, { status: 502 });
  }
}
