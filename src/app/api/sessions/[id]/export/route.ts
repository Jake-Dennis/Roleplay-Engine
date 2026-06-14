import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { notFoundError, badRequestError, serverError } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

interface ExportMessage {
  id: string;
  sender_name: string;
  content: string;
  timestamp: string;
}

function formatAsJson(messages: ExportMessage[]): string {
  return JSON.stringify(messages.map(m => ({
    id: m.id,
    sender: m.sender_name,
    content: m.content,
    timestamp: m.timestamp,
  })), null, 2);
}

function formatAsMarkdown(messages: ExportMessage[]): string {
  return messages.map(m =>
    `### ${m.sender_name} (${m.timestamp})\n\n${m.content}\n`
  ).join("\n---\n\n");
}

function formatAsText(messages: ExportMessage[]): string {
  return messages.map(m =>
    `[${m.timestamp}] ${m.sender_name}: ${m.content}`
  ).join("\n");
}

/**
 * GET /api/sessions/[id]/export
 *
 * Exports all session messages in the requested format. Supports JSON,
 * Markdown (md), and plain text (txt) formats. Returns the file as a
 * downloadable attachment with Content-Disposition set.
 *
 * @param request - The incoming Next.js request object with optional query param format ("json" | "md" | "txt", default "json")
 * @param params - Route parameters containing the session id
 * @returns Response with file download — Content-Type varies by format, Content-Disposition: attachment
 * @throws 400 - If format parameter is invalid (not json, md, or txt)
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
    const format = searchParams.get("format") || "json";

    if (!["json", "md", "txt"].includes(format)) {
      return badRequestError("Invalid format. Use json, md, or txt");
    }

    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `    ).get(sessionId, userId, userId);

    if (!session) {
      return notFoundError("Session");
    }

    // Fetch ALL messages (no pagination)
    const messages = db.prepare(`
      SELECT m.*, u.username as sender_name, er.display_name as persona_name, NULL as persona_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN entity_registry er ON m.persona_id = er.id
      WHERE m.session_id = ? AND m.is_deleted = 0
      ORDER BY m.timestamp ASC, m.id ASC
    `).all(sessionId);

    // Use raw DB results (snake_case) — all formatters expect snake_case fields
    let body: string;
    let contentType: string;
    let ext: string;

    if (format === "json") {
      body = formatAsJson(messages as ExportMessage[]);
      contentType = "application/json";
      ext = "json";
    } else if (format === "md") {
      body = formatAsMarkdown(messages as ExportMessage[]);
      contentType = "text/plain";
      ext = "md";
    } else {
      body = formatAsText(messages as ExportMessage[]);
      contentType = "text/plain";
      ext = "txt";
    }

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="chat-export.${ext}"`,
      },
    });
  } catch (err: unknown) {
    return serverError(err);
  }
}
