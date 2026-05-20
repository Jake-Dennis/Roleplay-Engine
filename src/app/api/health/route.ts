import { NextRequest, NextResponse } from "next/server";
import { OLLAMA_CONFIG, TTS_CONFIG, TIMEOUTS } from "@/lib/config";
import { getAuthToken } from "@/lib/auth-token";
import { getDb } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [ollamaResult, kokoroResult, dbResult] = await Promise.allSettled([
    checkOllama(),
    checkKokoro(),
    checkDb(),
  ]);

  const ollama = ollamaResult.status === "fulfilled" ? ollamaResult.value : { status: "error", error: "Health check failed" };
  const kokoro = kokoroResult.status === "fulfilled" ? kokoroResult.value : { status: "error", error: "Health check failed" };
  const db = dbResult.status === "fulfilled" ? dbResult.value : { status: "error", error: "Health check failed" };

  const allHealthy =
    ollama.status === "connected" &&
    kokoro.status === "connected" &&
    db.status === "connected";

  return NextResponse.json({
    ollama,
    kokoro,
    db,
    timestamp: Date.now(),
  }, { status: allHealthy ? 200 : 503 });
}

async function checkOllama() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.HEALTH_CHECK);

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
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.HEALTH_CHECK);

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

async function checkDb() {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return { status: "connected" };
  } catch (err) {
    return {
      status: "unavailable",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Allow localhost access
  const ip = getClientIp(request);
  if (ip === "127.0.0.1" || ip === "::1") {
    return true;
  }

  // Allow authenticated requests
  const token = getAuthToken(request);
  if (token) {
    return true;
  }

  return false;
}
