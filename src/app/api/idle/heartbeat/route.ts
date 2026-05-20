import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { processIdleTier } from "@/lib/idle-processing";
import { getAuthToken } from '@/lib/auth-token';

/**
 * POST /api/idle/heartbeat
 *
 * Called by the client when idle tier changes.
 * Triggers server-side enrichment jobs for the appropriate tier.
 *
 * Body: { idleTime: number, tier: number, page: string }
 */
export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    requireJson(request);
    const body = await request.json();
  const { idleTime, tier, page, universeId } = body;

  if (!tier || tier < 1 || tier > 4) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const db = getDb();

  // Update user's last activity timestamp
  db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(decoded.sub);

  // Check if this tier has already been processed (prevent duplicate jobs)
  const userRow = db.prepare(
    "SELECT last_idle_t FROM users WHERE id = ?"
  ).get(decoded.sub) as { last_idle_t: number | null } | undefined;

  const lastProcessedTier = userRow?.last_idle_t || 0;

  if (tier > lastProcessedTier) {
    // Process idle tier jobs with universe context
    await processIdleTier(decoded.sub, tier, page || "/", universeId || null);

    // Update the highest tier processed
    db.prepare("UPDATE users SET last_idle_t = ? WHERE id = ?").run(tier, decoded.sub);
  }

  return NextResponse.json({ success: true, tier });
}
