import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const GET = withErrorHandler(async (request: NextRequest) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`persona_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const db = getDb();
ensureGroupSupport(db);

const persona = db.prepare(
  "SELECT * FROM personas WHERE user_id = ? AND is_active = 1"
).get(decoded.sub);

return NextResponse.json({ persona: persona ? camelizeKeys(persona) : null }); });
