import { NextResponse } from 'next/server';

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
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  generate: { windowMs: 60 * 1000, maxRequests: 5 },
  upload: { windowMs: 60 * 1000, maxRequests: 20 },
  api: { windowMs: 60 * 1000, maxRequests: 100 },
};

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
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}
