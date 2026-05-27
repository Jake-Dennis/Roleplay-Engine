import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { unauthorizedError, notFoundError, badRequestError, serverError } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
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

/**
 * GET /api/sessions/[id]/messages/search
 *
 * Full-text search across session messages using FTS5. Returns matching
 * messages with highlighted snippets (via <mark> tags). Results are
 * sanitized to prevent XSS from malicious message content while preserving
 * search highlighting.
 *
 * @param request - The incoming Next.js request object with required query param q (search term)
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { results: Message[], total: number } — each result includes a snippet with FTS5 highlighting
 * @throws 400 - If query parameter q is missing
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult.auth;

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
    `).get(sessionId, userId, userId);

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
