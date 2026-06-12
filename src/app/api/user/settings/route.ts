/**
 * GET /api/user/settings — Returns the authenticated user's personal settings.
 * PUT /api/user/settings — Updates the authenticated user's personal settings.
 *
 * Per-user settings are stored as a JSON blob in `users.settings` column.
 * Only the authenticated user can read/write their own settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { notFoundError } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";

interface UserSettings {
  ttsSpeed?: number;
  ttsVolume?: number;
  ttsFormat?: string;
  ttsAutoPlay?: boolean;
  ttsSkipLong?: boolean;
  ttsLongThreshold?: number;
  llmModel?: string;
  embeddingModel?: string;
  autoTtsNarrator?: boolean;
  autoTtsOtherPersonas?: boolean;
  autoTtsYourPersona?: boolean;
}

/**
 * GET /api/user/settings
 * Returns the authenticated user's personal settings from users.settings JSON.
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`user_settings_read:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const db = getDb();
  const user = db.prepare(
    "SELECT settings, auto_tts_narrator, auto_tts_other_personas, auto_tts_your_persona FROM users WHERE id = ?"
  ).get(userId) as { settings: string | null; auto_tts_narrator: number | null; auto_tts_other_personas: number | null; auto_tts_your_persona: number | null } | undefined;

  if (!user) return notFoundError("User");

  let settings: UserSettings = {};
  if (user.settings) {
    try {
      settings = JSON.parse(user.settings);
    } catch { /* use defaults */ }
  }

  // Read auto-tts booleans from dedicated DB columns (source of truth),
  // falling back to JSON blob value, then defaulting to false.
  settings.autoTtsNarrator = user.auto_tts_narrator !== null ? Boolean(user.auto_tts_narrator) : (settings.autoTtsNarrator ?? false);
  settings.autoTtsOtherPersonas = user.auto_tts_other_personas !== null ? Boolean(user.auto_tts_other_personas) : (settings.autoTtsOtherPersonas ?? false);
  settings.autoTtsYourPersona = user.auto_tts_your_persona !== null ? Boolean(user.auto_tts_your_persona) : (settings.autoTtsYourPersona ?? false);

  return NextResponse.json({ settings });
}

/**
 * PUT /api/user/settings
 * Merges the provided fields into the user's settings JSON.
 * Accepts camelCase keys only (ttsSpeed, ttsVolume, ttsFormat, ttsAutoPlay, ttsSkipLong, ttsLongThreshold, autoTtsNarrator, autoTtsOtherPersonas, autoTtsYourPersona).
 */
export async function PUT(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`user_settings_write:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const db = getDb();

  // Migrate auto-tts columns if they don't already exist
  for (const col of ["auto_tts_narrator", "auto_tts_other_personas", "auto_tts_your_persona"]) {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch { /* column already exists */ }
  }

  const user = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;
  if (!user) return notFoundError("User");

  let current: UserSettings = {};
  if (user.settings) {
    try {
      current = JSON.parse(user.settings);
    } catch { /* use empty */ }
  }

  const body = await request.json();

  const allowedKeys = [
    "ttsSpeed", "ttsVolume", "ttsFormat",
    "ttsAutoPlay", "ttsSkipLong", "ttsLongThreshold",
    "llmModel", "embeddingModel",
    "autoTtsNarrator", "autoTtsOtherPersonas", "autoTtsYourPersona",
  ] as const;

  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      (current as Record<string, unknown>)[key] = body[key];
    }
  }

  // Map camelCase auto-tts keys to snake_case column names
  const camelToSnake: Record<string, string> = {
    autoTtsNarrator: "auto_tts_narrator",
    autoTtsOtherPersonas: "auto_tts_other_personas",
    autoTtsYourPersona: "auto_tts_your_persona",
  };

  // Build column updates for auto-tts fields (only if provided in the request)
  const columnUpdates: Record<string, number> = {};
  for (const [camel, snake] of Object.entries(camelToSnake)) {
    if (body[camel] !== undefined) {
      columnUpdates[snake] = body[camel] ? 1 : 0;
    }
  }

  // Write JSON blob and dedicated columns in a single transaction
  db.transaction(() => {
    db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(current), userId);

    if (Object.keys(columnUpdates).length > 0) {
      const setClauses = Object.keys(columnUpdates).map(col => `${col} = ?`).join(", ");
      const values = [...Object.values(columnUpdates), userId];
      db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);
    }
  })();

  return NextResponse.json({ settings: current, success: true });
}
