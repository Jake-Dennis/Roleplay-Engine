import { NextResponse } from "next/server";
import { OLLAMA_CONFIG, TTS_CONFIG } from "@/lib/config";

export async function GET() {
  const [ollamaResult, kokoroResult] = await Promise.allSettled([
    checkOllama(),
    checkKokoro(),
  ]);

  return NextResponse.json({
    ollama: ollamaResult.status === "fulfilled" ? ollamaResult.value : { status: "error", error: "Health check failed" },
    kokoro: kokoroResult.status === "fulfilled" ? kokoroResult.value : { status: "error", error: "Health check failed" },
    timestamp: Date.now(),
  });
}

async function checkOllama() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: "unavailable", error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);

    return {
      status: "connected",
      models,
      modelCount: models.length,
    };
  } catch (err) {
    return {
      status: "unavailable",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

async function checkKokoro() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${TTS_CONFIG.baseUrl}/v1/audio/voices`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: "unavailable", error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const voices = data.voices || [];

    return {
      status: "connected",
      voices,
      voiceCount: voices.length,
    };
  } catch (err) {
    return {
      status: "unavailable",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
