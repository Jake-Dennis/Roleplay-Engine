import { NextRequest } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { TIMEOUTS } from "@/lib/config";
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/jobs/stream
 * SSE endpoint for real-time job progress events.
 * Emits job:progress and job:completed events, with a heartbeat every 30s.
 *
 * @param request - The incoming Next.js request object
 * @returns Response with SSE stream (Content-Type: text/event-stream)
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return new Response(
    JSON.stringify({ error: 'Rate limit exceeded. Try again later.', retryAfter: rateLimit.retryAfter }),
    { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      eventBus.registerController(controller);
      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `id: 0\nevent: connected\ndata: ${JSON.stringify({ userId: userId })}\n\n`
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
      }, TIMEOUTS.LLM_FETCH);

      // Cleanup on connection close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubProgress();
        unsubCompleted();
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
