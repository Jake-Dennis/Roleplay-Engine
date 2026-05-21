import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { fetchLocalModels } from "@/lib/ollama";
import { OLLAMA_CONFIG } from "@/lib/config";
import { getAuthToken } from "@/lib/auth-token";
import { verifyToken } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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
