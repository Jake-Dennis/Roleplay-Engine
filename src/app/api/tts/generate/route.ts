import { NextRequest, NextResponse } from "next/server";
import { generateSpeech, getCachedAudio, cacheAudio } from "@/lib/tts";
import { TTS_CONFIG } from "@/lib/config";
import { verifyToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json();
  const { text, voice, speed = 1.0, format = TTS_CONFIG.defaultFormat } = body;

  if (!text || !voice) {
    return NextResponse.json(
      { error: "Text and voice are required" },
      { status: 400 }
    );
  }

  if (text.length > TTS_CONFIG.maxTextLength) {
    return NextResponse.json(
      { error: `Text exceeds maximum length of ${TTS_CONFIG.maxTextLength} characters` },
      { status: 400 }
    );
  }

  // Check cache first
  const cached = getCachedAudio(decoded.sub, text, voice, speed, format);
  if (cached) {
    return new NextResponse(cached.buffer as unknown as Blob, {
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

    return new NextResponse(audio as unknown as Blob, {
      headers: {
        "Content-Type": `audio/${format}`,
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "TTS generation failed", details: (error as Error).message },
      { status: 500 }
    );
  }
}
