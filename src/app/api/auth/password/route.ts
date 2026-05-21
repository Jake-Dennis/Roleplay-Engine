import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken, changePassword, validatePassword } from "@/lib/auth";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const PUT = withErrorHandler(async (request: NextRequest) => { const token = getAuthToken(request);
if (!token) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const decoded = await verifyToken(token);
if (!decoded) {
  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`password_change:${ip}`, "password_change");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { currentPassword, newPassword } = body;

if (!currentPassword || !newPassword) {
  return NextResponse.json(
    { error: "Current password and new password are required" },
    { status: 400 }
  );
}

  const pwError = validatePassword(newPassword);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const result = await changePassword(decoded.sub, currentPassword, newPassword);

if (!result.success) {
  return NextResponse.json({ error: result.error }, { status: 400 });
}

return NextResponse.json({ success: true }); });
