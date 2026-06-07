import { NextRequest, NextResponse } from "next/server";
import { generateSpeech, getCachedAudio, cacheAudio } from "@/lib/tts";
import { TTS_CONFIG } from "@/lib/config";
import { getUserTtsUrl } from "@/lib/ollama";
import { withAuth } from '@/lib/with-auth';
import { unauthorizedError, badRequestError, serverError, requireJson } from '@/lib/error-response';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Generates TTS audio for the given text and voice, with caching support.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ text, voice, speed?, format? }`
 * @returns NextResponse with audio blob (`audio/{format}`) and cache headers (`X-Cache: HIT | MISS`)
 * @throws 400 - If text or voice is missing
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded (tts_generate rate limit)
 * @throws 500 - If speech generation fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`tts_generate:${ip}`, "tts_generate");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { text, voice, speed = 1.0, format = TTS_CONFIG.defaultFormat } = body;

  if (!text || !voice) {
    return badRequestError("Text and voice are required");
  }

  // Check cache first
  const cached = getCachedAudio(userId, text, voice, speed, format);
  if (cached) {
    return new NextResponse(new Blob([new Uint8Array(cached.buffer)]), {
      headers: {
        "Content-Type": `audio/${format}`,
        "X-Cache": "HIT",
        "X-Duration": String(cached.duration),
      },
    });
  }

  // Generate new audio using user's TTS URL (fallback to server config)
  try {
    const ttsUrl = getUserTtsUrl(userId);
    const audio = await generateSpeech(text, voice, format, speed, ttsUrl);
    cacheAudio(userId, text, voice, speed, format, audio);

    return new NextResponse(new Blob([new Uint8Array(audio)]), {
      headers: {
        "Content-Type": `audio/${format}`,
        "X-Cache": "MISS",
      },
    });
  } catch (err: unknown) {
    return serverError(err);
  }
}
