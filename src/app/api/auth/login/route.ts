import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { authenticateUser, validateUsername, validatePassword } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries, getClientIp } from "@/lib/rate-limiter";

/**
 * POST /api/auth/login
 *
 * Authenticates a user with username and password credentials.
 * On success, sets an httpOnly auth-token cookie for subsequent requests.
 *
 * @param request - The incoming Next.js request object containing JSON body with username and password
 * @returns NextResponse with { success, user: { id, username } } and httpOnly auth-token cookie
 * @throws 400 - If username or password is missing, or validation fails
 * @throws 401 - If credentials are invalid
 * @throws 429 - If rate limit exceeded for this IP
 */
export async function POST(request: NextRequest) {
  cleanupExpiredEntries();

  const ip = getClientIp(request);
  const limit = checkRateLimit(`auth:${ip}`, "auth");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

  requireJson(request);

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const result = await authenticateUser(username, password);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        username: result.user.username,
      },
    });

    // Set secure httpOnly cookie — XSS-resistant, MITM-resistant
    response.cookies.set("auth-token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
