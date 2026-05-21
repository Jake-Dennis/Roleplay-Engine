import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { unauthorizedError, notFoundError, badRequestError, serverError } from "@/lib/error-response";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Escapes all HTML entities in text while preserving <mark> and </mark> tags.
 * FTS5's snippet() returns raw HTML — this prevents XSS from malicious message content
 * while keeping search highlighting intact.
 */
function escapeHtmlPreservingMarks(text: string): string {
  const MARK_OPEN = '\x00MARK_OPEN\x00';
  const MARK_CLOSE = '\x00MARK_CLOSE\x00';

  return text
    .replace(/<mark>/gi, MARK_OPEN)
    .replace(/<\/mark>/gi, MARK_CLOSE)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(MARK_OPEN, '<mark>')
    .replace(MARK_CLOSE, '</mark>');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return unauthorizedError();

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
    if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

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

    const camelized = camelizeKeys(results) as Array<Record<string, unknown>>;
    const sanitized = camelized.map((r) => ({
      ...r,
      snippet: r.snippet ? escapeHtmlPreservingMarks(r.snippet as string) : r.snippet,
    }));

    return NextResponse.json({
      results: sanitized,
      total: results.length,
    });
  } catch (err: unknown) {
    return serverError(err);
  }
}
