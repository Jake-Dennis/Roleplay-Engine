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
  auth: { windowMs: TIME.ONE_HOUR / 4, maxRequests: 10 },
  generate: { windowMs: TIME.ONE_MINUTE, maxRequests: 5 },
  upload: { windowMs: TIME.ONE_MINUTE, maxRequests: 20 },
  api: { windowMs: TIME.ONE_MINUTE, maxRequests: 100 },
};

/**
 * Extract the client IP address from a request.
 *
 * Reads the `x-real-ip` header set by middleware, which extracts the real
 * client IP using `request.ip` (Edge runtime) — resistant to spoofing via
 * forged X-Forwarded-For headers.
 *
 * When TRUSTED_PROXIES is set (comma-separated IPs), the middleware trusts
 * X-Forwarded-For instead — required for deployments behind reverse proxies
 * (nginx, Cloudflare, etc.).
 */
export function getClientIp(request: NextRequest): string {
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function checkRateLimit(
  key: string,
  tier: keyof typeof RATE_LIMITS = 'api'
): { allowed: boolean; retryAfter?: number; remaining: number } {
  const config = RATE_LIMITS[tier];
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000), remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count };
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
