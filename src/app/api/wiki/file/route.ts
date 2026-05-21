import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { fileAnswer } from "@/lib/wiki/filing";
import path from "path";
import { getAuthToken } from '@/lib/auth-token';
import { serverError, requireJson } from '@/lib/error-response';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { query, answer, citations, universeId } = body;

  if (!query || !answer || !Array.isArray(citations) || !universeId) {
    return NextResponse.json(
      { error: "query, answer, citations (array), and universeId are required" },
      { status: 400 }
    );
  }

  const queryError = validateLength(query, 1000, "Query");
  if (queryError) return NextResponse.json({ error: queryError }, { status: 400 });
  const answerError = validateLength(answer, 100000, "Answer");
  if (answerError) return NextResponse.json({ error: answerError }, { status: 400 });

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

  try {
    const result = await fileAnswer(query, answer, citations, wikiRoot, universeId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return serverError(err);
  }
}
