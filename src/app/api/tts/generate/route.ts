import { NextRequest, NextResponse } from "next/server";
import { generateSpeech, getCachedAudio, cacheAudio } from "@/lib/tts";
import { TTS_CONFIG } from "@/lib/config";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from '@/lib/auth-token';
import { unauthorizedError, badRequestError, serverError, requireJson } from '@/lib/error-response';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) {
    return unauthorizedError();
  }

  const decoded = await verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

    requireJson(request);
    const body = await request.json();
  const { text, voice, speed = 1.0, format = TTS_CONFIG.defaultFormat } = body;

  if (!text || !voice) {
    return badRequestError("Text and voice are required");
  }

  if (text.length > TTS_CONFIG.maxTextLength) {
    return badRequestError(`Text exceeds maximum length of ${TTS_CONFIG.maxTextLength} characters`);
  }

  // Check cache first
  const cached = getCachedAudio(decoded.sub, text, voice, speed, format);
  if (cached) {
    return new NextResponse(new Blob([new Uint8Array(cached.buffer)]), {
      headers: {
        "Content-Type": `audio/${format}`,
        "X-Cache": "HIT",
        "X-Duration": String(cached.duration),
      },
    });
  }

  // Generate new audio
  try {
    const audio = await generateSpeech(text, voice, format, speed);
    cacheAudio(decoded.sub, text, voice, speed, format, audio);

    return new NextResponse(new Blob([new Uint8Array(audio)]), {
      headers: {
        "Content-Type": `audio/${format}`,
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
