import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";
import type { DbDatabase, DbResult } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { unauthorizedError, notFoundError, requireJson } from '@/lib/error-response';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

function hasEntityAccess(db: DbDatabase, entityType: string, entityId: string, userId: string): DbResult | null {
  const entity = db.prepare(
    `SELECT r.*, u.group_id, g.owner_id as group_owner_id
     FROM relationships r
     LEFT JOIN universes u ON r.universe_id = u.id
     LEFT JOIN groups g ON u.group_id = g.id
     WHERE r.id = ?`
  ).get(entityId) as DbResult | undefined;

  if (!entity) return null;

  // Direct ownership
  if ((entity.user_id as string) === userId) return entity;

  // Group membership
  if (entity.group_id && isGroupMember(db, entity.group_id as string, userId)) return entity;

  return null;
}

export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return unauthorizedError();
const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

const rel = hasEntityAccess(db, "relationships", id, decoded.sub);
if (!rel) return notFoundError("Relationship");
return NextResponse.json({ relationship: camelizeKeys(rel) }); });

export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return unauthorizedError();
const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_write:${ip}`, "relationship_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  requireJson(request);
  const body = await request.json();
const db = getDb();
ensureGroupSupport(db);

const existing = hasEntityAccess(db, "relationships", id, decoded.sub);
if (!existing) return notFoundError("Relationship");

const { emotionalState, sharedHistory, relationshipStage, decayRates } = body;
db.prepare(
  "UPDATE relationships SET emotional_state = COALESCE(?, emotional_state), shared_history = COALESCE(?, shared_history), relationship_stage = COALESCE(?, relationship_stage), decay_rates = COALESCE(?, decay_rates), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
).run(
  emotionalState ? JSON.stringify(emotionalState) : null,
  sharedHistory ? JSON.stringify(sharedHistory) : null,
  relationshipStage || null,
  decayRates ? JSON.stringify(decayRates) : null,
  id
);

const rel = db.prepare("SELECT * FROM relationships WHERE id = ?").get(id);
return NextResponse.json({ relationship: camelizeKeys(rel) }); });

export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return unauthorizedError();
const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_write:${ip}`, "relationship_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

const existing = hasEntityAccess(db, "relationships", id, decoded.sub);
if (!existing) return notFoundError("Relationship");

db.prepare("DELETE FROM relationships WHERE id = ?").run(id);
return NextResponse.json({ success: true }); });
