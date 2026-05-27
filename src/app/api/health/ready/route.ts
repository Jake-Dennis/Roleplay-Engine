import { NextRequest, NextResponse } from "next/server";
import { OLLAMA_CONFIG, TTS_CONFIG, TIMEOUTS } from "@/lib/config";
import { getAuthToken } from "@/lib/auth-token";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

/**
 * GET /api/health/ready
 * Readiness probe — returns 200 only when all critical dependencies (Ollama, Kokoro TTS, DB) are reachable.
 * Returns 503 if any service is down. Restricted to localhost or authenticated.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { status, services, timestamp }
 * @throws 401 - If not authorized (not localhost and no valid token)
 * @throws 503 - If any critical dependency is unavailable
 */
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
    status: allHealthy ? "ready" : "not_ready",
    services: { ollama, kokoro, db },
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

    return { status: "connected", modelCount: models.length };
  } catch (err: unknown) {
    logger.error("Ollama readiness check failed", err as Error);
    return {
      status: "unavailable",
      error: "Connection failed",
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

    return { status: "connected", voiceCount: voices.length };
  } catch (err: unknown) {
    logger.error("Kokoro TTS readiness check failed", err as Error);
    return {
      status: "unavailable",
      error: "Connection failed",
    };
  }
}

async function checkDb() {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return { status: "connected" };
  } catch (err: unknown) {
    logger.error("Database readiness check failed", err as Error);
    return {
      status: "unavailable",
      error: "Connection failed",
    };
  }
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const ip = getClientIp(request);
  if (ip === "127.0.0.1" || ip === "::1") {
    return true;
  }

  const token = getAuthToken(request);
  if (token) {
    const decoded = await verifyToken(token);
    return decoded !== null;
  }

  return false;
}
