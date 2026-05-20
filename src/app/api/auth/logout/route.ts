import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { revokeToken, cleanupExpiredDenylistEntries } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Attempt to revoke the current token
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (token) {
      const payload = decodeJwt(token);
      if (payload.jti && payload.exp) {
        revokeToken(payload.jti as string, payload.exp as number);
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
