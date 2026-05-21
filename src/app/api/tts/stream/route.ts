import { NextRequest } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { generateSpeechStream } from "@/lib/tts";
import { getAuthToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';
import { TTS_CONFIG } from '@/lib/config';
import { checkRateLimit, createRateLimitResponse } from '@/lib/rate-limiter';

const VALID_FORMATS = ["mp3", "wav", "ogg"] as const;
const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return new Response("Invalid token", { status: 401 });

  const rateLimit = checkRateLimit(`tts_stream:${decoded.sub}`, "tts_stream");
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

  if (text.length > TTS_CONFIG.maxTextLength) {
    return new Response(
      JSON.stringify({ error: `Text exceeds maximum length of ${TTS_CONFIG.maxTextLength} characters` }),
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
    const audioStream = await generateSpeechStream(text, voice, format, speed);

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
