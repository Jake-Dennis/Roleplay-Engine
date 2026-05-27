import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { TTS_CONFIG } from "@/lib/config";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Combines multiple TTS voices into a single blended voice file.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ voiceSpec: string }`
 * @returns Response with binary `.pt` file download
 * @throws 400 - If voiceSpec is missing or invalid
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the voice combine request fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { voiceSpec } = body;

  if (!voiceSpec || typeof voiceSpec !== "string") {
    return NextResponse.json(
      { error: "voiceSpec is required (e.g., 'af_bella(2)+af_sky(1)')" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${TTS_CONFIG.baseUrl}/v1/audio/voices/combine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voiceSpec),
      signal: AbortSignal.timeout(TTS_CONFIG.timeout),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Voice combine failed: ${response.status}` },
        { status: response.status }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="combined_voice.pt"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to combine voices" },
      { status: 500 }
    );
  }
}
