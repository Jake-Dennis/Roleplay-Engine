import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`persona_write:${ip}`, "persona_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

// Verify ownership
const existing = db.prepare(
  "SELECT * FROM personas WHERE id = ? AND user_id = ?"
).get(id, decoded.sub);

if (!existing) {
  return NextResponse.json({ error: "Persona not found" }, { status: 404 });
}

// Deactivate all personas, then activate this one
db.prepare("UPDATE personas SET is_active = 0 WHERE user_id = ?").run(decoded.sub);
db.prepare("UPDATE personas SET is_active = 1 WHERE id = ?").run(id);

const persona = db.prepare("SELECT * FROM personas WHERE id = ?").get(id);

return NextResponse.json({ persona }); });
