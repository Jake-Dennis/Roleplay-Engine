import { NextRequest, NextResponse } from "next/server";
import { verifyToken, revokeToken, cleanupExpiredDenylistEntries } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`auth_logout:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  // Attempt to revoke the current token
  try {
    const token = request.cookies.get("auth-token")?.value;
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
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
