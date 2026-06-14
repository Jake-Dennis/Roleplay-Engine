import { camelizeKeys } from '@/lib/response-utils';
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureParticipantColumns } from "@/lib/session-columns";
import { withAuth } from '@/lib/with-auth';
import { notFoundError, requireJson } from '@/lib/error-response';
import { logger } from '@/lib/logger';
import { safeParseWarn } from "@/lib/safe-json";
import type { DbRow } from "@/lib/types";
import { validateLength } from '@/lib/validation';
import { isValidUUID } from '@/lib/validation/uuid-validator';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { queueJob } from '@/lib/job-processor';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { listWikiPages, deleteWikiPage } from '@/lib/wiki/file-io';
import fs from 'fs';

/**
 * GET /api/sessions/[id]
 *
 * Retrieves a single session with all associated data: messages, participants,
 * scene state, turn configuration, and ownership info. Messages include
 * branch indicators (has_siblings) for conversation branching support.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { session, messages, sceneState, participants, turnConfig, isOwner }
 * @throws 400 - If the session ID format is invalid
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const db = getDb();
  ensureParticipantColumns(db);

  const session = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.id = ? AND (s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
  `).get(id, userId, userId);

  if (!session) {
    return notFoundError("Session");
  }

  // Get messages (A1: include has_siblings for branch indicator)
  const messages = db.prepare(`
    SELECT m.*, COALESCE(sp.character_name, u.username) as sender_name,
      (SELECT COUNT(*) > 0 FROM messages m2
       WHERE m2.parent_message_id = m.parent_message_id
       AND m2.id != m.id AND m2.is_deleted = 0) as has_siblings
    FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    LEFT JOIN session_participants sp ON m.session_id = sp.session_id AND m.sender_id = sp.user_id
    WHERE m.session_id = ? AND m.is_deleted = 0
    ORDER BY m.rowid ASC
  `).all(id);

  // Get participants
  const participants = db.prepare(`
    SELECT u.id, u.username, sp.role, sp.character_name, sp.entity_id, sp.joined_at
    FROM session_participants sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.session_id = ?
    ORDER BY sp.joined_at ASC
  `).all(id);

  // Get scene state + turn config in single query (eliminates 4 separate queries)
  const combined = db.prepare(`
    SELECT
      ss.id as ss_id,
      ss.session_id as ss_session_id,
      ss.active_location_id,
      ss.current_goal,
      ss.emotional_tone,
      ss.active_npcs,
      ss.active_npc_ids,
      ss.active_threads,
      ss.scene_summary,
      ss.updated_at as ss_updated_at,
      tm.value as turn_mode_value,
      tov.value as turn_order_value,
      ct.value as current_turn_value
    FROM (SELECT 1) AS dummy
    LEFT JOIN scene_states ss ON ss.session_id = ?
    LEFT JOIN session_config tm ON tm.session_id = ? AND tm.key = 'turn_mode'
    LEFT JOIN session_config tov ON tov.session_id = ? AND tov.key = 'turn_order'
    LEFT JOIN session_config ct ON ct.session_id = ? AND ct.key = 'current_turn'
    ORDER BY ss.updated_at DESC
    LIMIT 1
  `).get(id, id, id, id) as DbRow | undefined;

  const sceneState = combined && (combined as Record<string, unknown>).ss_id
    ? {
        id: (combined as Record<string, unknown>).ss_id,
        session_id: (combined as Record<string, unknown>).ss_session_id,
        active_location_id: (combined as Record<string, unknown>).active_location_id,
        current_goal: (combined as Record<string, unknown>).current_goal,
        emotional_tone: (combined as Record<string, unknown>).emotional_tone,
        active_npcs: (combined as Record<string, unknown>).active_npcs,
        active_npc_ids: (combined as Record<string, unknown>).active_npc_ids,
        active_threads: (combined as Record<string, unknown>).active_threads,
        scene_summary: (combined as Record<string, unknown>).scene_summary,
        updated_at: (combined as Record<string, unknown>).ss_updated_at,
      }
    : null;

  let turnConfig: { turnMode: string; turnOrder: string[]; currentTurn: string | null } = {
    turnMode: "freeform",
    turnOrder: [],
    currentTurn: null,
  };
  try {
    turnConfig = {
      turnMode: ((combined as Record<string, unknown>)?.turn_mode_value as string) || "freeform",
      turnOrder: safeParseWarn<string[]>((combined as Record<string, unknown>)?.turn_order_value as string, "turn order", []) ?? [],
      currentTurn: ((combined as Record<string, unknown>)?.current_turn_value as string) || null,
    };
  } catch (err: unknown) { logger.warn("[sessions] turn config parse failed:", err); }

  return NextResponse.json({
    session: camelizeKeys(session),
    messages: camelizeKeys(messages),
    sceneState: sceneState || null,
    participants: camelizeKeys(participants),
    turnConfig,
    isOwner: (session as Record<string, unknown>).owner_id === userId,
  });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[sessions/${id}] GET failed: ${errorMessage}`, err);
    return NextResponse.json({
      error: process.env.NODE_ENV === 'development' ? errorMessage : "Internal server error"
    }, { status: 500 });
  }
}

/**
 * PUT /api/sessions/[id]
 *
 * Updates a session's name and/or status. Only the session owner can
 * perform this operation.
 *
 * @param request - The incoming Next.js request object containing JSON body with optional name and/or status
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { session: Session }
 * @throws 400 - If the session ID format is invalid or name exceeds 200 characters
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found or user is not the owner
 * @throws 429 - If rate limit exceeded
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const db = getDb();

  // Verify ownership
  const session = db.prepare(
    "SELECT * FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(id, userId);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  requireJson(request);
  const body = await request.json();
  const { name, status } = body;

  if (name !== undefined) {
    const nameError = validateLength(name, 200, "Name");
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
  }

  // Capture old status before update for diff-based timeline entry creation
  const oldStatus = (session as Record<string, unknown>).status as string | undefined;

  db.prepare(
    "UPDATE sessions SET name = COALESCE(?, name), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(name || null, status || null, id);

  const updated = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);

  // Auto-create timeline entry for session end on status transition
  if (oldStatus === "active" && (status === "ended" || status === "archived")) {
    try {
      const entryId = crypto.randomUUID();
      const sessionName = (updated as Record<string, unknown>).name as string;
      db.prepare(`
        INSERT INTO timeline_entries (id, user_id, universe_id, session_id, thread_id, title, description, occurred_at, entry_type, importance)
        VALUES (?, ?, (SELECT universe_id FROM sessions WHERE id = ?), ?, ?, ?, ?, CURRENT_TIMESTAMP, 'session_end', 'medium')
      `).run(entryId, userId, id, id, null, `Session ${status}: ${sessionName}`, null);
    } catch {
      // Non-fatal — timeline entry should not block session update
    }

    // Queue session recap on session end (min 10 messages)
    try {
      const msgCount = db.prepare(
        "SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_deleted = 0"
      ).get(id) as { count: number } | undefined;
      if (msgCount && msgCount.count >= 10) {
        queueJob(userId, "generate_session_recap", {
          sessionId: id,
          userId,
        }, "low", (updated as Record<string, unknown>).universe_id as string | undefined);
      }
    } catch {
      // Non-fatal — failure to queue recap should not block session update
    }
  }

  return NextResponse.json({ session: camelizeKeys(updated) });
}

/**
 * DELETE /api/sessions/[id]
 *
 * Deletes a session and all associated data (messages, participants, scene state,
 * embeddings, summaries, TTS cache jobs). Only the session owner can perform
 * this operation. Queues universe-level re-extraction jobs after deletion.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true }
 * @throws 400 - If the session ID format is invalid
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found or user is not the owner
 * @throws 429 - If rate limit exceeded
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const db = getDb();

  const session = db.prepare(
    "SELECT * FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(id, userId);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  const universeId = (session as Record<string, unknown>)?.universe_id as string | null;

  // Clean up derived data
  db.prepare("DELETE FROM message_edits WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?)").run(id);
  db.prepare("DELETE FROM message_summaries WHERE source_message_id IN (SELECT id FROM messages WHERE session_id = ?)").run(id);
  db.prepare("DELETE FROM embedding_vectors WHERE embedding_id IN (SELECT ei.id FROM embedding_index ei WHERE ei.entity_type = 'message' AND ei.entity_id IN (SELECT id FROM messages WHERE session_id = ?))").run(id);
  db.prepare("DELETE FROM embedding_index WHERE entity_type = 'message' AND entity_id IN (SELECT id FROM messages WHERE session_id = ?)").run(id);
  db.prepare("DELETE FROM tts_cache WHERE user_id = ? AND text_content IN (SELECT content FROM messages WHERE session_id = ?)").run(userId, id);

  // Remove all jobs referencing this session (all statuses)
  db.prepare("DELETE FROM job_queue WHERE json_extract(payload, '$.sessionId') = ?").run(id);
  db.prepare("DELETE FROM job_queue WHERE json_extract(payload, '$.session_id') = ?").run(id);

  // Cascade: delete orphaned session-dependent data
  db.prepare("DELETE FROM session_config WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM session_settings WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM narrative_memories WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM decision_points WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM timeline_entries WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM invitations WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM narrative_threads WHERE session_id = ?").run(id);

  // Delete messages, participants, scene state, session
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM session_participants WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM scene_states WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);

  // Clean up auto-extracted wiki pages tagged with this session
  if (universeId) {
    try {
      const wikiRoot = getWikiRoot(userId, universeId);
      if (fs.existsSync(wikiRoot)) {
        const allPages = listWikiPages(wikiRoot);
        const sessionTag = `source:session-${id}`;
        for (const page of allPages) {
          if (page.frontmatter.tags?.includes(sessionTag)) {
            try {
              deleteWikiPage(page.path);
            } catch { /* skip locked or failed pages */ }
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to clean up wiki pages for session ${id}:`, err);
    }
  }

  // Queue universe-level re-extraction if this session was in a universe
  if (universeId) {
    // Verify the universe exists before queuing FK-referencing jobs
    const universeExists = db.prepare("SELECT 1 FROM universes WHERE id = ?").get(universeId);
    if (universeExists) {
      try {
        queueJob(userId, "scene_state_extract", {
          sessionId: id,
          userId,
          universeId,
        }, "low", universeId);
      } catch { /* non-fatal — re-extraction is best-effort */ }

      try {
        queueJob(userId, "analyze_relationships", {
          sessionId: id,
          userId,
        }, "low", universeId);
      } catch { /* non-fatal — relationship analysis is best-effort */ }
    }
  }

  return NextResponse.json({ success: true });
}
