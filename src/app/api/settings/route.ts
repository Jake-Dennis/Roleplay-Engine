import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { OLLAMA_CONFIG, TTS_CONFIG } from "@/lib/config";
import { fetchLocalModels } from "@/lib/ollama";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;

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
    const decoded = verifyToken(token);
    if (decoded) {
      const db = getDb();
      const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(decoded.sub) as { settings: string | null } | undefined;
      if (row?.settings) {
        try {
          const userSettings = JSON.parse(row.settings);
          return NextResponse.json({
            ...serverConfig,
            user: {
              llmModel: userSettings.llmModel || OLLAMA_CONFIG.model,
              embeddingModel: userSettings.embeddingModel || OLLAMA_CONFIG.embeddingModel,
            },
          });
        } catch {
          // Invalid JSON, fall through
        }
      }
      return NextResponse.json({
        ...serverConfig,
        user: {
          llmModel: OLLAMA_CONFIG.model,
          embeddingModel: OLLAMA_CONFIG.embeddingModel,
        },
      });
    }
  }

  return NextResponse.json(serverConfig);
}

export async function PUT(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { llmModel, embeddingModel } = body;

  if (!llmModel && !embeddingModel) {
    return NextResponse.json({ error: "At least one setting is required" }, { status: 400 });
  }

  const db = getDb();

  // Get existing settings
  const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(decoded.sub) as { settings: string | null } | undefined;
  let userSettings: Record<string, any> = {};
  if (row?.settings) {
    try {
      userSettings = JSON.parse(row.settings);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Update settings
  if (llmModel) userSettings.llmModel = llmModel;
  if (embeddingModel) userSettings.embeddingModel = embeddingModel;

  db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(
    JSON.stringify(userSettings),
    decoded.sub
  );

  return NextResponse.json({
    success: true,
    settings: {
      llmModel: userSettings.llmModel || OLLAMA_CONFIG.model,
      embeddingModel: userSettings.embeddingModel || OLLAMA_CONFIG.embeddingModel,
    },
  });
}
