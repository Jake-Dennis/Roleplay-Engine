import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { discoverVoices } from "@/lib/voice-discovery";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Discovers and refreshes available TTS voices from the Kokoro service.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with `{ success: true, voices, count }`
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If voice discovery fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  try {
    const voices = await discoverVoices();
    return NextResponse.json({
      success: true,
      voices,
      count: voices.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to discover voices", success: false },
      { status: 500 }
    );
  }
}
