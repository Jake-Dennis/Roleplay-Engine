import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { withErrorHandler } from "@/lib/with-error-handler";
import { badRequestError } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { getClientIp, checkRateLimit, createRateLimitResponse } from "@/lib/rate-limiter";

/**
 * GET /api/sessions/[id]/config
 * Returns session_config key-value pairs for a session.
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await withAuth(request);
  if ("error" in auth) return auth.error;
  const { userId } = auth.auth;
  const { id: sessionId } = await params;

  const db = getDb();
  const access = db.prepare(
    "SELECT 1 FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).get(sessionId, userId);
  const owner = db.prepare(
    "SELECT 1 FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, userId);
  if (!access && !owner) return badRequestError("Forbidden");

  const rows = db.prepare("SELECT key, value FROM session_config WHERE session_id = ?").all(sessionId) as { key: string; value: string }[];
  const config: Record<string, string> = {};
  for (const row of rows) config[row.key] = row.value;

  return NextResponse.json({ config });
});

/**
 * PUT /api/sessions/[id]/config
 * Upserts session_config key-value pairs.
 */
export const PUT = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await withAuth(request);
  if ("error" in auth) return auth.error;
  const { userId } = auth.auth;
  const { id: sessionId } = await params;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const db = getDb();
  const access = db.prepare(
    "SELECT 1 FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).get(sessionId, userId);
  const owner = db.prepare(
    "SELECT 1 FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, userId);
  if (!access && !owner) return badRequestError("Forbidden");

  const body = await request.json();
  const allowedKeys = ["narrator_perspective", "narrator_pacing", "narrator_npc_voices", "narrator_style"];

  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      if (body[key] === null || body[key] === "") {
        db.prepare("DELETE FROM session_config WHERE session_id = ? AND key = ?").run(sessionId, key);
      } else {
        db.prepare(
          "INSERT INTO session_config (session_id, key, value) VALUES (?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
        ).run(sessionId, key, String(body[key]));
      }
    }
  }

  return NextResponse.json({ success: true });
});
