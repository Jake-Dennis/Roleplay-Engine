import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { unauthorizedError, notFoundError, badRequestError, internalError } from "@/lib/error-response";
import { getAuthToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return unauthorizedError();

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, decoded.sub, decoded.sub);

    if (!session) {
      return notFoundError("Session");
    }

    const query = searchParams.get("q");
    if (!query) return badRequestError("Query parameter 'q' is required");

    // Escape FTS5 special characters
    const escapedQuery = query.replace(/["*]/g, "");

    const results = db.prepare(`
      SELECT m.*, snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
      FROM messages m
      JOIN messages_fts f ON m.rowid = f.rowid
      WHERE m.session_id = ? AND messages_fts MATCH ?
      ORDER BY m.timestamp DESC
      LIMIT 50
    `).all(sessionId, escapedQuery);

    return NextResponse.json({
      results: camelizeKeys(results),
      total: results.length,
    });
  } catch (err) {
    logger.error("GET /api/sessions/[id]/messages/search error:", err);
    return internalError();
  }
}
