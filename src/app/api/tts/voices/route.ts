import { NextResponse } from "next/server";
import { getAvailableVoices, parseVoiceInfo, checkTTSConnection } from "@/lib/tts";

export async function GET() {
  // Try to refresh voices if not yet loaded
  const voices = getAvailableVoices();
  if (voices.length === 0) {
    await checkTTSConnection();
  }

  const updatedVoices = getAvailableVoices();

  return NextResponse.json({
    voices: updatedVoices,
    voiceDetails: updatedVoices.map((v) => ({
      id: v,
      ...parseVoiceInfo(v),
    })),
  });
}

export async function POST() {
  await checkTTSConnection();
  const voices = getAvailableVoices();

  return NextResponse.json({
    voices,
    voiceDetails: voices.map((v) => ({
      id: v,
      ...parseVoiceInfo(v),
    })),
  });
}
