import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { changePassword, validatePassword } from "@/lib/auth";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/auth/password
 *
 * Changes the authenticated user's password. Requires both the current password
 * and a new password. Validates the new password against length and character rules.
 *
 * @param request - The incoming Next.js request object containing JSON body with currentPassword and newPassword
 * @returns NextResponse with { success: true }
 * @throws 400 - If current or new password is missing, validation fails, or current password is incorrect
 * @throws 401 - If authentication fails or token is missing
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

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

  const result = await changePassword(userId, currentPassword, newPassword);

if (!result.success) {
  return NextResponse.json({ error: result.error }, { status: 400 });
}

return NextResponse.json({ success: true }); });
