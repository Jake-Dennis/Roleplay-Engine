import { NextRequest } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { generateSpeechStream } from "@/lib/tts";
import { getUserTtsUrl } from "@/lib/ollama";
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse } from '@/lib/rate-limiter';

const VALID_FORMATS = ["mp3", "wav", "ogg"] as const;
const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

/**
 * Streams TTS audio in real-time for the given text and voice.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ text, voice, speed?, format? }`
 * @returns Response with streaming audio (`audio/{format}`, `Cache-Control: no-cache`)
 * @throws 400 - If text or voice is missing, format is invalid, or speed is out of range
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded (tts_stream rate limit)
 * @throws 500 - If streaming generation fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const rateLimit = checkRateLimit(`tts_stream:${userId}`, "tts_stream");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit.retryAfter!);
  }

  requireJson(request);
  const body = await request.json();
  const { text, voice, speed = 1.0, format = "mp3" } = body;

  if (!text || !voice) {
    return new Response(
      JSON.stringify({ error: "text and voice are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!VALID_FORMATS.includes(format)) {
    return new Response(
      JSON.stringify({ error: `Invalid format. Must be one of: ${VALID_FORMATS.join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (typeof speed !== "number" || speed < MIN_SPEED || speed > MAX_SPEED) {
    return new Response(
      JSON.stringify({ error: `Speed must be between ${MIN_SPEED} and ${MAX_SPEED}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const ttsUrl = getUserTtsUrl(userId);
    const audioStream = await generateSpeechStream(text, voice, format, speed, ttsUrl);

    return new Response(audioStream, {
      headers: {
        "Content-Type": `audio/${format}`,
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: unknown) {
    logger.error("TTS streaming failed", err as Error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
