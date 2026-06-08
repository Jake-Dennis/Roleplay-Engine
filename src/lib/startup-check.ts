/**
 * Startup Health Checks
 *
 * Validates critical dependencies on application startup:
 * 1. JWT_SECRET is set (required)
 * 2. data/ directory is writable
 * 3. Ollama connectivity (warn if unreachable)
 * 4. Database connectivity
 */

import fs from 'fs';
import path from 'path';
import { APP_CONFIG, TIMEOUTS } from '@/lib/config';

export async function runStartupChecks(): Promise<void> {
  // JWT_SECRET check
  if (!process.env.JWT_SECRET) {
    console.error('[startup] FATAL: JWT_SECRET is required');
    process.exit(1);
  }
  console.log('[startup] JWT_SECRET: set');

  // Data directory check
  const dataDir = path.resolve(APP_CONFIG.dataDir);
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    console.log(`[startup] Data directory: ${dataDir} (writable)`);
  } catch {
    console.error(`[startup] FATAL: Data directory not writable: ${dataDir}`);
    process.exit(1);
  }

  // Ollama check (warn only)
  try {
    const res = await fetch(`${process.env.OLLAMA_HOST || 'http://192.168.6.1:11434'}/api/tags`, { signal: AbortSignal.timeout(TIMEOUTS.HEALTH_CHECK) });
    console.log(`[startup] Ollama: ${res.ok ? 'connected' : `HTTP ${res.status}`}`);
  } catch {
    console.warn('[startup] Ollama: not reachable (LLM features disabled)');
  }

  // Database check
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    db.prepare('SELECT 1').get();
    console.log('[startup] Database: connected');
  } catch (err: unknown) {
    console.error('[startup] FATAL: Database connection failed:', err);
    process.exit(1);
  }

  console.log('[startup] All checks passed');
}
