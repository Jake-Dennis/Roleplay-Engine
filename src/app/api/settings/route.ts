import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { OLLAMA_CONFIG, TTS_CONFIG } from "@/lib/config";
import { fetchLocalModels } from "@/lib/ollama";
import { safeParseWarn } from "@/lib/safe-json";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/settings
 * Get server configuration (Ollama/Kokoro hosts, local models) merged with user-specific settings.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { ollama, tts, user }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`settings_read:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  // Fetch local models in parallel
  const localModels = await fetchLocalModels();

  // Base server config (always available)
  const serverConfig = {
    ollama: {
      host: `${OLLAMA_CONFIG.host}:${OLLAMA_CONFIG.port}`,
      model: OLLAMA_CONFIG.model,
      embeddingModel: OLLAMA_CONFIG.embeddingModel,
      localModels,
    },
    tts: {
      host: `${TTS_CONFIG.host}:${TTS_CONFIG.port}`,
      defaultVoice: TTS_CONFIG.defaultVoice,
    },
  };

  // Merge user settings
  const db = getDb();
  const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;
  if (row?.settings) {
    const userSettings = safeParseWarn<Record<string, string>>(row.settings, "user settings");
    if (userSettings) {
      return NextResponse.json({
        ...serverConfig,
        user: {
          llmModel: userSettings.llmModel || OLLAMA_CONFIG.model,
          embeddingModel: userSettings.embeddingModel || OLLAMA_CONFIG.embeddingModel,
          ttsSpeed: userSettings.ttsSpeed ?? 1.0,
          ttsVolume: userSettings.ttsVolume ?? 0.8,
          ttsFormat: userSettings.ttsFormat || "mp3",
          ttsAutoPlay: userSettings.ttsAutoPlay ?? true,
          ttsSkipLong: userSettings.ttsSkipLong ?? true,
          ttsLongThreshold: userSettings.ttsLongThreshold ?? 500,
        },
      });
    }
  }
  return NextResponse.json({
    ...serverConfig,
    user: {
      llmModel: OLLAMA_CONFIG.model,
      embeddingModel: OLLAMA_CONFIG.embeddingModel,
      ttsSpeed: 1.0,
      ttsVolume: 0.8,
      ttsFormat: "mp3",
      ttsAutoPlay: true,
      ttsSkipLong: true,
      ttsLongThreshold: 500,
    },
  }); });

/**
 * PUT /api/settings
 * Update user-specific settings (LLM model, embedding model, TTS preferences).
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { success: true, settings }
 * @throws 400 - If no settings were provided
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`settings_write:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { llmModel, embeddingModel, ttsSpeed, ttsVolume, ttsFormat, ttsAutoPlay, ttsSkipLong, ttsLongThreshold } = body;

if (!llmModel && !embeddingModel && ttsSpeed === undefined && ttsVolume === undefined && !ttsFormat && ttsAutoPlay === undefined && ttsSkipLong === undefined && ttsLongThreshold === undefined) {
  return NextResponse.json({ error: "At least one setting is required" }, { status: 400 });
}

const db = getDb();

// Get existing settings
const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;
let userSettings: Record<string, unknown> = {};
if (row?.settings) {
  const parsed = safeParseWarn<Record<string, unknown>>(row.settings, "user settings");
  if (parsed) userSettings = parsed;
}

// Update settings
if (llmModel) userSettings.llmModel = llmModel;
if (embeddingModel) userSettings.embeddingModel = embeddingModel;
if (ttsSpeed !== undefined) userSettings.ttsSpeed = ttsSpeed;
if (ttsVolume !== undefined) userSettings.ttsVolume = ttsVolume;
if (ttsFormat) userSettings.ttsFormat = ttsFormat;
if (ttsAutoPlay !== undefined) userSettings.ttsAutoPlay = ttsAutoPlay;
if (ttsSkipLong !== undefined) userSettings.ttsSkipLong = ttsSkipLong;
if (ttsLongThreshold !== undefined) userSettings.ttsLongThreshold = ttsLongThreshold;

db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(
  JSON.stringify(userSettings),
  userId
);

return NextResponse.json({
  success: true,
  settings: {
    llmModel: userSettings.llmModel || OLLAMA_CONFIG.model,
    embeddingModel: userSettings.embeddingModel || OLLAMA_CONFIG.embeddingModel,
    ttsSpeed: userSettings.ttsSpeed ?? 1.0,
    ttsVolume: userSettings.ttsVolume ?? 0.8,
    ttsFormat: userSettings.ttsFormat || "mp3",
    ttsAutoPlay: userSettings.ttsAutoPlay ?? true,
    ttsSkipLong: userSettings.ttsSkipLong ?? true,
    ttsLongThreshold: userSettings.ttsLongThreshold ?? 500,
  },
}); });
