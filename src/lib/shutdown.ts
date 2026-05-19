/**
 * Graceful Shutdown Handlers
 *
 * Registers SIGTERM/SIGINT handlers to cleanly shut down the application:
 * 1. Log shutdown start
 * 2. Close database connection
 * 3. Log shutdown complete
 */

import { closeDb } from '@/lib/db';

let isShuttingDown = false;

export function setupGracefulShutdown(): void {
  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`[shutdown] Received ${signal}, shutting down gracefully...`);
      try {
        closeDb();
        console.log('[shutdown] Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[shutdown] Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
}
