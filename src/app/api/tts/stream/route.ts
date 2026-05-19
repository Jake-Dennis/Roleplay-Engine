import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { generateSpeechStream } from "@/lib/tts";
import { getAuthToken } from '@/lib/auth-token';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return new Response("Invalid token", { status: 401 });

  const body = await request.json();
  const { text, voice, speed = 1.0, format = "mp3" } = body;

  if (!text || !voice) {
    return new Response(
      JSON.stringify({ error: "text and voice are required" }),
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
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "TTS streaming failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
