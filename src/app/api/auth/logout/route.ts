import { NextRequest, NextResponse } from "next/server";
import { verifyToken, revokeToken, cleanupExpiredDenylistEntries } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { getAuthToken } from '@/lib/auth-token';

/**
 * POST /api/auth/logout
 *
 * Logs out the current user by revoking their JWT token and clearing the auth-token cookie.
 * Succeeds gracefully even without a valid token — always clears the cookie.
 *
 * @param request - The incoming Next.js request object (cookie with auth-token is read)
 * @returns NextResponse with { success: true } and cleared auth-token cookie
 * @throws 429 - If rate limit exceeded for this IP
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`auth_logout:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  // Attempt to revoke the current token
  try {
    const token = getAuthToken(request);
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        revokeToken(payload.jti, payload.exp);
      }
    }
  } catch {
    // Graceful degradation — logout still succeeds
  }

  // Opportunistically clean up expired denylist entries
  try {
    cleanupExpiredDenylistEntries();
  } catch {
    // Non-fatal
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("auth-token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
