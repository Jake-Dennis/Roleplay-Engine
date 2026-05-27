import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { processRelationshipDecay, getDecayStats } from "@/lib/relationship-decay";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { hasRelationshipAccess } from '@/lib/relationship-access';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Gets decay statistics for a relationship.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ id }` — the relationship UUID
 * @returns NextResponse with `{ relationship, stats }` — relationship data and decay statistics
 * @throws 401 - If authentication fails
 * @throws 404 - If the relationship is not found or user lacks access
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

// Verify ownership
const relationship = hasRelationshipAccess(db, id, userId);
if (!relationship) {
  return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
}

// Get decay stats for user
const stats = getDecayStats(userId);

return NextResponse.json({
  relationship,
  stats,
}); });

/**
 * Triggers relationship decay processing for the authenticated user.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ id }` — the relationship UUID
 * @returns NextResponse with `{ success: true, decayedCount, decayedRelationships }`
 * @throws 401 - If authentication fails
 * @throws 404 - If the relationship is not found or user lacks access
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_write:${ip}`, "relationship_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

// Verify ownership
const relationship = hasRelationshipAccess(db, id, userId);
if (!relationship) {
  return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
}

// Process decay for this user
const result = processRelationshipDecay(userId);

return NextResponse.json({
  success: true,
  decayedCount: result.decayedCount,
  decayedRelationships: result.decayedRelationships,
}); });
