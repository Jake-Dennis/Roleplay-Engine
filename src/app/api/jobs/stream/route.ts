import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/jobs/stream
 *
 * SSE endpoint for real-time job progress events.
 * Emits:
 *  - job:progress   { jobId, progress, message }
 *  - job:completed  { jobId, type }
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return new Response("Invalid token", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `id: 0\nevent: connected\ndata: ${JSON.stringify({ userId: decoded.sub })}\n\n`
        )
      );

      // Subscribe to job progress events
      const unsubProgress = eventBus.on(SessionEvents.JOB_PROGRESS, (data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(
              `id: ${eventBus.getCurrentEventId()}\nevent: job:progress\ndata: ${JSON.stringify({
                jobId: data.jobId,
                progress: data.progress,
                message: data.message,
              })}\n\n`
            )
          );
        } catch {
          // Connection may be closed
        }
      });

      // Subscribe to job completed events
      const unsubCompleted = eventBus.on(SessionEvents.JOB_COMPLETED, (data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(
              `id: ${eventBus.getCurrentEventId()}\nevent: job:completed\ndata: ${JSON.stringify({
                jobId: data.jobId,
                type: data.type,
              })}\n\n`
            )
          );
        } catch {
          // Connection may be closed
        }
      });

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `id: ${eventBus.getCurrentEventId()}\nevent: heartbeat\ndata: {}\n\n`
            )
          );
        } catch {
          // Connection may be closed
        }
      }, 30000);

      // Cleanup on connection close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubProgress();
        unsubCompleted();
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
