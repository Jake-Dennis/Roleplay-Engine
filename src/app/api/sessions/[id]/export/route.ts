import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { notFoundError, unauthorizedError, badRequestError, internalError } from "@/lib/error-response";
import { getAuthToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return unauthorizedError();

    const decoded = await verifyToken(token);
    if (!decoded) return unauthorizedError();

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
    `).get(sessionId, decoded.sub, decoded.sub);

    if (!session) {
      return notFoundError("Session");
    }

    // Fetch ALL messages (no pagination)
    const messages = db.prepare(`
      SELECT m.*, u.username as sender_name, p.name as persona_name, p.avatar_url as persona_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN personas p ON m.persona_id = p.id
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
  } catch (err) {
    logger.error("GET /api/sessions/[id]/export error:", err);
    return internalError();
  }
}
