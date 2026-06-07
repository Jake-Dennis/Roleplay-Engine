import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getAvailableVoices, checkTTSConnection } from "@/lib/tts";
import { getUserTtsUrl } from "@/lib/ollama";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Lists available TTS voices from the connected Kokoro service.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with `{ voices, voiceDetails }`
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

// Try to refresh voices if not yet loaded
const voices = getAvailableVoices();
if (voices.length === 0) {
  const ttsUrl = getUserTtsUrl(userId);
  await checkTTSConnection(ttsUrl);
}

const updatedVoices = getAvailableVoices();

return NextResponse.json({
  voices: updatedVoices.map((v) => v.id),
  voiceDetails: updatedVoices,
}); });

/**
 * Refreshes the TTS voice list from the Kokoro service and returns updated voices.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with `{ voices, voiceDetails }`
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const ttsUrl = getUserTtsUrl(userId);
await checkTTSConnection(ttsUrl);
const voices = getAvailableVoices();

return NextResponse.json({
  voices: voices.map((v) => v.id),
  voiceDetails: voices,
}); });
