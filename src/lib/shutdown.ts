/**
 * Graceful Shutdown Handlers
 *
 * Registers SIGTERM/SIGINT handlers to cleanly shut down the application:
 * 1. Drain event bus — close all active SSE streams
 * 2. Mark all "processing" jobs as "failed" with reason "server shutdown"
 * 3. Close database connection
 *
 * All shutdown steps are wrapped in a 5-second timeout to prevent hanging.
 */

import { closeDb, getDb } from '@/lib/db';
import { eventBus } from '@/lib/event-bus';

let isShuttingDown = false;

const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Close all active SSE stream connections and clear event handlers.
 */
function drainEventBus(): number {
  const closed = eventBus.drainAll();
  if (closed > 0) {
    console.log(`[shutdown] Closed ${closed} active SSE stream(s)`);
  }
  return closed;
}

/**
 * Mark all jobs currently in "processing" state as failed.
 */
function failProcessingJobs(): number {
  const db = getDb();
  const result = db.prepare(
    "UPDATE job_queue SET status = 'failed', error = 'server shutdown', processed_at = CURRENT_TIMESTAMP WHERE status = 'processing'"
  ).run();
  const count = result.changes;
  if (count > 0) {
    console.log(`[shutdown] Marked ${count} processing job(s) as failed`);
  }
  return count;
}

/**
 * Run all shutdown steps with a timeout.
 * Returns a promise that resolves when shutdown is complete or times out.
 */
async function runShutdown(): Promise<void> {
  const shutdownSteps = async () => {
    drainEventBus();
    failProcessingJobs();
    closeDb();
  };

  const timeout = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error('Shutdown timed out after 5s')), SHUTDOWN_TIMEOUT_MS);
  });

  await Promise.race([shutdownSteps(), timeout]);
}

export function setupGracefulShutdown(): void {
  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`[shutdown] Received ${signal}, shutting down gracefully...`);
      try {
        await runShutdown();
        console.log('[shutdown] Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[shutdown] Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
}
