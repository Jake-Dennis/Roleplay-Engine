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
  const user = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string | null } | undefined;

  if (!user) return notFoundError("User");

  let settings: UserSettings = {};
  if (user.settings) {
    try {
      settings = JSON.parse(user.settings);
    } catch { /* use defaults */ }
  }

  return NextResponse.json({ settings });
}

/**
 * PUT /api/user/settings
 * Merges the provided fields into the user's settings JSON.
 * Accepts camelCase keys only (ttsSpeed, ttsVolume, ttsFormat, ttsAutoPlay, ttsSkipLong, ttsLongThreshold).
 */
export async function PUT(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`user_settings_write:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const db = getDb();
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
  ] as const;

  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      (current as Record<string, unknown>)[key] = body[key];
    }
  }

  db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(current), userId);

  return NextResponse.json({ settings: current, success: true });
}
