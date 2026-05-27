import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { TIMEOUTS } from "@/lib/config";
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/sessions/[id]/stream
 *
 * SSE endpoint for real-time session events.
 * Supports Last-Event-ID for reconnection.
 * Tracks connection count for monitoring.
 *
 * Events:
 *  - message:created       new message added
 *  - message:updated       message edited
 *  - message:deleted       messages deleted
 *  - generation:started    AI generation begins
 *  - generation:done       AI generation completes
 *  - participant:joined    user joined session
 *  - participant:left      user left session
 *  - participant:kicked    user was kicked
 *  - participant:invited   user was invited
 *  - turn:updated          turn state changed
 *  - session:updated       general session change (polling fallback)
 *  - heartbeat             keep-alive every 30s
 *
 * @param request - The incoming Next.js request object (reads last-event-id header for reconnection)
 * @param params - Route parameters containing the session id
 * @returns Response with SSE stream (text/event-stream) — emits typed events with JSON data payloads
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded or too many SSE connections (max connections reached)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
  if (!rateLimit.allowed) return new Response(
    JSON.stringify({ error: 'Rate limit exceeded. Try again later.', retryAfter: rateLimit.retryAfter }),
    { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
  );

  const { id: sessionId } = await params;

  // Verify session access
  const db = getDb();
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
  ).get(sessionId, userId, userId);

  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  // Parse Last-Event-ID for reconnection support
  const lastEventIdHeader = request.headers.get("last-event-id");
  const lastEventId = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : 0;

  // Track the last known message timestamp for polling fallback
  const lastMessage = db.prepare(
    "SELECT MAX(timestamp) as max_ts FROM messages WHERE session_id = ? AND is_deleted = 0"
  ).get(sessionId) as { max_ts: string | null } | undefined;

  let lastTimestamp = lastMessage?.max_ts || "";

  // Track this connection
  const connectionId = `${sessionId}:${userId}:${Date.now()}`;

  // D6: Check connection limit before allowing new connection
  if (!eventBus.canConnect(sessionId)) {
    return new Response(
      JSON.stringify({ error: "Too many connections", maxConnections: eventBus.getMaxConnections() }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const connectionCount = eventBus.addConnection(sessionId);
  if (connectionCount === -1) {
    return new Response(
      JSON.stringify({ error: "Too many connections", maxConnections: eventBus.getMaxConnections() }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      eventBus.registerController(controller);
      // Replay missed events if reconnecting
      if (lastEventId > 0) {
        const missedEvents = eventBus.getEventsSince(sessionId, lastEventId);
        for (const evt of missedEvents) {
          try {
            controller.enqueue(
              encoder.encode(
                `id: ${evt.id}\nevent: ${evt.name}\ndata: ${JSON.stringify(evt.data)}\n\n`
              )
            );
          } catch {
            // Connection may be closed
            break;
          }
        }
      }

      // Send initial connected event with connection ID
      controller.enqueue(
        encoder.encode(
          `id: ${eventBus.getCurrentEventId()}\nevent: connected\ndata: ${JSON.stringify({
            sessionId,
            connectionId,
            connections: eventBus.getConnectionCount(sessionId),
          })}\n\n`
        )
      );

      // Subscribe to all session events
      const eventTypes = [
        SessionEvents.MESSAGE_CREATED,
        SessionEvents.MESSAGE_UPDATED,
        SessionEvents.MESSAGE_DELETED,
        SessionEvents.GENERATION_STARTED,
        SessionEvents.GENERATION_DONE,
        SessionEvents.PARTICIPANT_JOINED,
        SessionEvents.PARTICIPANT_LEFT,
        SessionEvents.PARTICIPANT_KICKED,
        SessionEvents.PARTICIPANT_INVITED,
        SessionEvents.PARTICIPANT_ROLE_CHANGED,
        SessionEvents.TURN_UPDATED,
        // D5: New SSE events
        SessionEvents.SCENE_UPDATED,
        SessionEvents.THREAD_UPDATED,
        SessionEvents.JOB_COMPLETED,
        SessionEvents.JOB_PROGRESS,
        // Wiki page events
        SessionEvents.WIKI_PAGE_CREATED,
        SessionEvents.WIKI_PAGE_UPDATED,
      ];

      const unsubscribers = eventTypes.map((eventType) =>
        eventBus.on(`${eventType}:${sessionId}`, (data: Record<string, unknown>) => {
          // Extract event ID and strip internal metadata from payload
          const { _eventId: eventId, ...payload } = data;
          try {
            controller.enqueue(
              encoder.encode(
                `id: ${eventId}\nevent: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`
              )
            );
          } catch {
            // Connection may be closed
          }
        })
      );

      // Heartbeat + polling fallback every 30s
      const heartbeat = setInterval(() => {
        try {
          // Poll for new messages (handles message actions that bypass event bus)
          const latest = db.prepare(
            "SELECT MAX(timestamp) as max_ts FROM messages WHERE session_id = ? AND is_deleted = 0"
          ).get(sessionId) as { max_ts: string | null } | undefined;

          if (latest && latest.max_ts && latest.max_ts !== lastTimestamp) {
            lastTimestamp = latest.max_ts;
            const id = eventBus.getCurrentEventId();
            controller.enqueue(
              encoder.encode(
                `id: ${id}\nevent: session:updated\ndata: ${JSON.stringify({
                  timestamp: latest.max_ts,
                  connections: eventBus.getConnectionCount(sessionId),
                })}\n\n`
              )
            );
          }

          // Heartbeat with connection count
          const hbId = eventBus.getCurrentEventId();
          controller.enqueue(
            encoder.encode(
              `id: ${hbId}\nevent: heartbeat\ndata: ${JSON.stringify({
                connections: eventBus.getConnectionCount(sessionId),
              })}\n\n`
            )
          );
        } catch {
          // Connection may be closed
        }
      }, TIMEOUTS.LLM_FETCH);

      // Cleanup on connection close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribers.forEach((unsub) => unsub());
        eventBus.removeConnection(sessionId);
        eventBus.unregisterController(controller);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
