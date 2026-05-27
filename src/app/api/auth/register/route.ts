import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { createUser, validateUsername, validatePassword } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries, getClientIp } from "@/lib/rate-limiter";

/**
 * POST /api/auth/register
 *
 * Creates a new user account with the provided username and password.
 * Validates both fields against length and character rules before creating.
 *
 * @param request - The incoming Next.js request object containing JSON body with username and password
 * @returns NextResponse with { success, user: { id, username } } (201) on success
 * @throws 400 - If username or password is missing, or validation fails
 * @throws 409 - If the username already exists
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

    const user = await createUser(username, password);

    if (!user) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          username: user.username,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
