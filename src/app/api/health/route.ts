import { NextRequest, NextResponse } from "next/server";
import { OLLAMA_CONFIG, TTS_CONFIG, TIMEOUTS } from "@/lib/config";
import { getAuthToken } from "@/lib/auth-token";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getClientIp, checkRateLimit, createRateLimitResponse } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

/**
 * GET /api/health
 * Checks the health of Ollama LLM, Kokoro TTS, and SQLite database.
 * Returns connection status for each service with model/voice details.
 * Localhost requests are authorized by IP; remote requests require valid JWT.
 *
 * @param request - The incoming Next.js request
 * @returns NextResponse with { ollama, kokoro, db, timestamp } — 200 if all healthy, 503 if any unhealthy
 * @throws 401 - If request is not from localhost and lacks valid auth token
 * @throws 429 - If rate limit exceeded
 */
export async function GET(request: NextRequest) {
  // Rate limit health checks (frequent polling)
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`health:${ip}`, "health");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

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
  } catch (err: unknown) {
    logger.error("Ollama health check failed", err as Error);
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

    return {
      status: "connected",
      voices,
      voiceCount: voices.length,
    };
  } catch (err: unknown) {
    logger.error("Kokoro TTS health check failed", err as Error);
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
    logger.error("Database health check failed", err as Error);
    return {
      status: "unavailable",
      error: "Connection failed",
    };
  }
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Allow localhost access
  const ip = getClientIp(request);
  if (ip === "127.0.0.1" || ip === "::1") {
    return true;
  }

  // Dev mode: x-real-ip may not be set (no proxy), check Next.js built-in request.ip
  // and the Host header as fallback for localhost detection
  if (ip === "unknown") {
    const ri = (request as { ip?: string }).ip;
    if (ri === "127.0.0.1" || ri === "::1" || ri === "::ffff:127.0.0.1") {
      return true;
    }
    const host = request.headers.get("host") || "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
      return true;
    }
  }

  // Allow authenticated requests
  const token = getAuthToken(request);
  if (token) {
    const decoded = await verifyToken(token);
    return decoded !== null;
  }

  return false;
}
