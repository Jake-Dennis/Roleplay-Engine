import { NextRequest, NextResponse } from "next/server";
import { createUser, validateUsername, validatePassword } from "@/lib/auth";
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
