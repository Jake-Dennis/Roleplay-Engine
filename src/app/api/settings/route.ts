/**
 * GET /api/settings — Returns server-wide configuration.
 * PUT /api/settings — Updates server-wide configuration.
 *
 * Settings are stored in the `server_config` DB table (singleton row)
 * and fall back to environment variables → hardcoded defaults defined
 * in src/lib/config.ts.  Changes take effect immediately for subsequent
 * reads (the DB is queried fresh on every call).
 */

import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { getServerConfig, updateServerConfig } from '@/lib/server-config';
import { fetchLocalModels } from "@/lib/ollama";

/**
 * GET /api/settings
 * Returns the resolved server configuration (DB overrides atop env-var defaults)
 * plus locally available Ollama models.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`settings_read:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const config = getServerConfig();
  const localModels = await fetchLocalModels();

  return NextResponse.json({
    ollama: {
      host: config.ollama.host,
      port: config.ollama.port,
      model: config.ollama.model,
      embeddingModel: config.ollama.embeddingModel,
      useJobsModel: config.ollama.useJobsModel,
      jobModel: config.ollama.jobModel,
      localModels,
    },
    tts: {
      host: config.tts.host,
      port: config.tts.port,
      defaultVoice: config.tts.defaultVoice,
    },
    defaults: {
      ttsSpeed: config.tts.defaultSpeed,
      ttsVolume: config.tts.defaultVolume,
      ttsFormat: config.tts.defaultFormat,
      ttsAutoPlay: config.tts.autoPlay,
      ttsSkipLong: config.tts.skipLong,
      ttsLongThreshold: config.tts.longThreshold,
    },
    /**
     * Per-model overrides for generation params. Keyed by model name.
     * When a model has overrides here, those values take precedence
     * over the global `ollama.*` defaults during generation.
     */
    modelDefaults: config.modelDefaults,
  });
});

/**
 * PUT /api/settings
 * Updates server-wide configuration.  Only provided fields are changed
 * (partial merge).  Accepts snake_case column names matching the DB schema.
 */
export const PUT = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`settings_write:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();

  // Build update payload — only pick known keys from the request body
  const allowedKeys = [
    "ollama_host", "ollama_port", "ollama_model", "ollama_embedding_model",
    "ollama_use_jobs_model", "ollama_job_model",
    "tts_host", "tts_port", "tts_default_voice",
    "tts_default_speed", "tts_default_volume", "tts_default_format",
    "tts_auto_play", "tts_skip_long", "tts_long_threshold",
  ] as const;

  const update: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      update[key] = body[key];
    }
  }

  // Also accept camelCase variants for API convenience
  const camelToSnake: Record<string, string> = {
    ollamaHost: "ollama_host",
    ollamaPort: "ollama_port",
    ollamaModel: "ollama_model",
    ollamaEmbeddingModel: "ollama_embedding_model",
    ollamaUseJobsModel: "ollama_use_jobs_model",
    ollamaJobModel: "ollama_job_model",
    ttsHost: "tts_host",
    ttsPort: "tts_port",
    ttsDefaultVoice: "tts_default_voice",
    ttsDefaultSpeed: "tts_default_speed",
    ttsDefaultVolume: "tts_default_volume",
    ttsDefaultFormat: "tts_default_format",
    ttsAutoPlay: "tts_auto_play",
    ttsSkipLong: "tts_skip_long",
    ttsLongThreshold: "tts_long_threshold",
    modelDefaults: "model_defaults",
  };
  for (const [camel, snake] of Object.entries(camelToSnake)) {
    if (body[camel] !== undefined && update[snake] === undefined) {
      update[snake] = body[camel];
    }
  }

  // Validate model_defaults shape: must be an object keyed by model name.
  // Each value is a partial ModelSettings — only the fields set in the
  // request are merged into the stored map; this lets callers update
  // a single model without sending the whole map.
  if (update.model_defaults !== undefined) {
    const map = update.model_defaults;
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      return NextResponse.json({ error: "modelDefaults must be an object keyed by model name" }, { status: 400 });
    }
    for (const [model, settings] of Object.entries(map as Record<string, unknown>)) {
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        return NextResponse.json({ error: `modelDefaults[${model}] must be an object` }, { status: 400 });
      }
    }
    // Merge with existing map so callers can update one model at a time.
    const existing = getServerConfig().modelDefaults;
    update.model_defaults = { ...existing, ...map };
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "At least one setting is required" }, { status: 400 });
  }

  updateServerConfig(update);

  // Return the full resolved config after the update
  const config = getServerConfig();

  return NextResponse.json({
    success: true,
    settings: {
      ollama: {
        host: config.ollama.host,
        port: config.ollama.port,
        model: config.ollama.model,
        embeddingModel: config.ollama.embeddingModel,
        useJobsModel: config.ollama.useJobsModel,
        jobModel: config.ollama.jobModel,
      },
      tts: {
        host: config.tts.host,
        port: config.tts.port,
        defaultVoice: config.tts.defaultVoice,
      },
      defaults: {
        ttsSpeed: config.tts.defaultSpeed,
        ttsVolume: config.tts.defaultVolume,
        ttsFormat: config.tts.defaultFormat,
        ttsAutoPlay: config.tts.autoPlay,
        ttsSkipLong: config.tts.skipLong,
        ttsLongThreshold: config.tts.longThreshold,
      },
      modelDefaults: config.modelDefaults,
    },
  });
});
