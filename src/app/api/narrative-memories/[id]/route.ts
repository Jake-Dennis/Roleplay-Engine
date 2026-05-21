import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAuthToken } from '@/lib/auth-token';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);
const { id } = await params;
const db = getDb();
const memory = db.prepare("SELECT * FROM narrative_memories WHERE id = ? AND user_id = ?").get(id, decoded.sub);
if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
return NextResponse.json({ memory: camelizeKeys(memory) }); });

export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_write:${ip}`, "narrative_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);
const { id } = await params;
  requireJson(request);
  const body = await request.json();
const db = getDb();
const existing = db.prepare("SELECT id FROM narrative_memories WHERE id = ? AND user_id = ?").get(id, decoded.sub);
if (!existing) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
const { content, type, importance, relatedEntities } = body;

if (content !== undefined) {
  const contentError = validateLength(content, 100000, "Content");
  if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });
}
db.prepare(
  "UPDATE narrative_memories SET content = COALESCE(?, content), type = COALESCE(?, type), importance = COALESCE(?, importance), related_entities = COALESCE(?, related_entities) WHERE id = ?"
).run(content || null, type || null, importance ? JSON.stringify(importance) : null, relatedEntities ? JSON.stringify(relatedEntities) : null, id);
return NextResponse.json({ success: true }); });

export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_write:${ip}`, "narrative_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);
const { id } = await params;
const db = getDb();
db.prepare("DELETE FROM narrative_memories WHERE id = ? AND user_id = ?").run(id, decoded.sub);
return NextResponse.json({ success: true }); });
