import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        "FATAL: JWT_SECRET environment variable is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
      );
    }
    return secret;
  })()
);

// Routes that don't require authentication
const publicRoutes = ["/login", "/register", "/api/auth/login", "/api/auth/register", "/api/auth/me"];

// NOTE: All protected routes are handled client-side via layout.tsx auth check.
// Middleware can't read localStorage, which is needed for IP/DDNS-based access.
// The client-side guard in (app)/layout.tsx checks /api/auth/me with x-auth-token header.
const protectedRoutes: string[] = [];

async function verifyToken(token: string): Promise<{ sub: string; username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      sub: payload.sub as string,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let token = request.cookies.get("auth-token")?.value;

  // Fallback: check for token in header (for IP-based access where cookies may fail)
  if (!token) {
    token = request.headers.get("x-auth-token") || undefined;
  }

  // Check if route is public
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    // If already authenticated, redirect to dashboard
    if (token) {
      const decoded = await verifyToken(token);
      if (decoded && (pathname === "/login" || pathname === "/register")) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    return NextResponse.next();
  }

  // Check if route is protected
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.set("auth-token", "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/tts|api/generate|api/embed).*)",
  ],
};
