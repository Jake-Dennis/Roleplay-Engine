import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { fetchLocalModels } from "@/lib/ollama";
import { OLLAMA_CONFIG } from "@/lib/config";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/ollama/models
 * Fetch available Ollama models using the local model fetcher.
 * Returns categorized models along with configured default LLM and embedding model.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { models, defaultLlm, defaultEmbedding }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const models = await fetchLocalModels();
  return NextResponse.json({
    models,
    defaultLlm: OLLAMA_CONFIG.model,
    defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
  });
});
