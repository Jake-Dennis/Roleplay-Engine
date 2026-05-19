import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { getAuthToken } from '@/lib/auth-token';

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
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return new Response("Invalid token", { status: 401 });

  const { id: sessionId } = await params;

  // Verify session access
  const db = getDb();
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
  ).get(sessionId, decoded.sub, decoded.sub);

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
  const connectionId = `${sessionId}:${decoded.sub}:${Date.now()}`;

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
        SessionEvents.TURN_UPDATED,
        // D5: New SSE events
        SessionEvents.SCENE_UPDATED,
        SessionEvents.THREAD_UPDATED,
        SessionEvents.JOB_COMPLETED,
        SessionEvents.JOB_PROGRESS,
      ];

      const unsubscribers = eventTypes.map((eventType) =>
        eventBus.on(`${eventType}:${sessionId}`, (data: Record<string, unknown>) => {
          const eventId = data._eventId;
          const eventName = data._eventName;
          // Clean up internal fields
          const { _eventId, _eventName, ...payload } = data;
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
      }, 30000);

      // Cleanup on connection close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribers.forEach((unsub) => unsub());
        eventBus.removeConnection(sessionId);
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
