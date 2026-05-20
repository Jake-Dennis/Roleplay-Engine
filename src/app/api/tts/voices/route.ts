import { NextResponse } from "next/server";
import { getAvailableVoices, checkTTSConnection } from "@/lib/tts";

export async function GET() {
  // Try to refresh voices if not yet loaded
  const voices = getAvailableVoices();
  if (voices.length === 0) {
    await checkTTSConnection();
  }

  const updatedVoices = getAvailableVoices();

  return NextResponse.json({
    voices: updatedVoices.map((v) => v.id),
    voiceDetails: updatedVoices,
  });
}

export async function POST() {
  await checkTTSConnection();
  const voices = getAvailableVoices();

  return NextResponse.json({
    voices: voices.map((v) => v.id),
    voiceDetails: voices,
  });
}
