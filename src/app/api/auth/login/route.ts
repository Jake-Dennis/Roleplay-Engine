import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, validateUsername, validatePassword } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";

export async function POST(request: NextRequest) {
  cleanupExpiredEntries();

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const limit = checkRateLimit(`auth:${ip}`, "auth");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

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
