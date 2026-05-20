import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { OLLAMA_CONFIG, TTS_CONFIG } from "@/lib/config";
import { fetchLocalModels } from "@/lib/ollama";
import { getAuthToken } from '@/lib/auth-token';
import { safeParseWarn } from "@/lib/safe-json";

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);

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

  // If authenticated, merge user settings
  if (token) {
    const decoded = await verifyToken(token);
    if (decoded) {
      const db = getDb();
      const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(decoded.sub) as { settings: string | null } | undefined;
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
      });
    }
  }

  return NextResponse.json(serverConfig);
}

export async function PUT(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    requireJson(request);
    const body = await request.json();
  const { llmModel, embeddingModel, ttsSpeed, ttsVolume, ttsFormat, ttsAutoPlay, ttsSkipLong, ttsLongThreshold } = body;

  if (!llmModel && !embeddingModel && ttsSpeed === undefined && ttsVolume === undefined && !ttsFormat && ttsAutoPlay === undefined && ttsSkipLong === undefined && ttsLongThreshold === undefined) {
    return NextResponse.json({ error: "At least one setting is required" }, { status: 400 });
  }

  const db = getDb();

  // Get existing settings
  const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(decoded.sub) as { settings: string | null } | undefined;
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
    decoded.sub
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
  });
}
