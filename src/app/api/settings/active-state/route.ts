import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const PUT = withErrorHandler(async (request: NextRequest) => { const authToken = getAuthToken(request);
if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(authToken);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`active_state:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { groupId, sessionId, universeId } = body;

const db = getDb();
ensureGroupSupport(db);

// Build dynamic update — only touch fields that were provided
const updates: string[] = [];
const values: (string | null)[] = [];

if ("groupId" in body) {
  updates.push("last_active_group_id = ?");
  values.push(groupId || null);
}
if ("sessionId" in body) {
  updates.push("last_active_session_id = ?");
  values.push(sessionId || null);
}
if ("universeId" in body) {
  updates.push("last_active_universe_id = ?");
  values.push(universeId || null);
}

if (updates.length === 0) {
  return NextResponse.json({ success: true });
}

values.push(decoded.sub);
db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

return NextResponse.json({ success: true }); });
