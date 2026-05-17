import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-this-to-a-random-secret-key"
);

// Routes that don't require authentication
const publicRoutes = ["/login", "/register", "/api/auth/login", "/api/auth/register"];

// Routes that should redirect to login if not authenticated
const protectedRoutes = ["/dashboard", "/session", "/universe", "/lore", "/characters", "/settings"];

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
  const token = request.cookies.get("auth-token")?.value;

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
