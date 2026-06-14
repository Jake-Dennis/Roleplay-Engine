import { NextRequest, NextResponse } from 'next/server';
import { TIME } from '@/lib/config';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  generate: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  upload: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  api: { windowMs: TIME.ONE_MINUTE, maxRequests: 1000 },
  message_send: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  wiki_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  user_search: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  create_resource: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  persona_npc: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  invitations: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  tts_stream: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  // Wiki
  wiki_read: { windowMs: TIME.ONE_MINUTE, maxRequests: 1000 },
  wiki_query: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
  // TTS
  tts_generate: { windowMs: TIME.ONE_MINUTE, maxRequests: 20 },
  // Session
  session_read: { windowMs: TIME.ONE_MINUTE, maxRequests: 60 },
  session_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 30 },
  // Relationship
  relationship_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 30 },
  // Persona/NPC
  persona_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 20 },
  npc_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 20 },
  // Universe
  universe_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 10 },
  // Timeline
  timeline_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 20 },
  // Narrative
  narrative_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 20 },
  // Group
  group_write: { windowMs: TIME.ONE_MINUTE, maxRequests: 20 },
  // Auth
  password_change: { windowMs: TIME.ONE_MINUTE, maxRequests: 5 },
  // Jobs
  jobs_trigger: { windowMs: TIME.ONE_MINUTE, maxRequests: 10 },
  // Search
  search: { windowMs: TIME.ONE_MINUTE, maxRequests: 30 },
  // Health
  health: { windowMs: TIME.ONE_MINUTE, maxRequests: 30 },
};

/**
 * Extract the client IP address from a request.
 *
 * Reads the `x-real-ip` header set by the Next.js proxy, which extracts the real
 * client IP using `request.ip` — resistant to spoofing via
 * forged X-Forwarded-For headers.
 *
 * When TRUSTED_PROXIES is set (comma-separated IPs), the proxy trusts
 * X-Forwarded-For instead — required for deployments behind reverse proxies
 * (nginx, Cloudflare, etc.).
 */
export function getClientIp(request: NextRequest): string {
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function checkRateLimit(
  _key: string,
  _tier: keyof typeof RATE_LIMITS = 'api'
): { allowed: boolean; retryAfter?: number; remaining: number } {
  return { allowed: true, remaining: 9999 };
}

export function createRateLimitResponse(retryAfter: number): Response {
  return NextResponse.json(
    { error: 'Rate limit exceeded. Try again later.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

let lastCleanup = 0;
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < TIME.ONE_MINUTE * 5) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}
