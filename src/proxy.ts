import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyTokenBasic } from "@/lib/auth-edge";
import { validateCsrfToken, csrfErrorResponse } from "@/lib/csrf";

// Routes that don't require authentication
const publicRoutes = ["/login", "/register", "/api/auth/login", "/api/auth/register", "/api/auth/me"];

// NOTE: All protected routes are handled client-side via layout.tsx auth check.
// Middleware can't read localStorage, which is needed for IP/DDNS-based access.
const protectedRoutes: string[] = [];

/**
 * Extract the real client IP, resistant to spoofing.
 *
 * In Next.js 16 proxy, request.ip is available at runtime (not typed).
 * When TRUSTED_PROXIES is set, we trust x-forwarded-for (upstream proxy overwrites it).
 * Otherwise we use request.ip directly, ignoring any client-supplied header.
 */
function getRealIp(request: NextRequest): string {
  // request.ip is available at runtime in Next.js proxy but not in TS types
  const ip = (request as unknown as { ip?: string }).ip;
  const trustedProxies = process.env.TRUSTED_PROXIES;

  if (trustedProxies) {
    const proxyList = trustedProxies.split(',').map((p) => p.trim());
    const serverIp = ip ?? '';
    if (proxyList.includes(serverIp)) {
      const forwarded = request.headers.get('x-forwarded-for');
      if (forwarded) {
        return forwarded.split(',')[0].trim();
      }
    }
  }

  return ip ?? 'unknown';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth-token")?.value;

  // Generate unique request ID for correlation
  const requestId = crypto.randomUUID();

  // Attach the real client IP as an internal header for route handlers.
  // This prevents IP spoofing via forged x-forwarded-for headers.
  const realIp = getRealIp(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-real-ip', realIp);
  requestHeaders.set('x-request-id', requestId);

  // CSRF protection: Double Submit Cookie pattern.
  // Validates that the X-CSRF-Token header matches the csrf-token cookie.
  // Cross-origin attackers cannot set custom headers, so a matching pair
  // proves the request originated from the same site.
  // Auth routes (login, register) are skipped — they run before CSRF exists.
  // NOTE: /api/generate is intentionally excluded from the proxy matcher
  // (see config.matcher below) because SSE streaming responses would break
  // from a 403 mid-stream. The auth cookie + rate limiter provide sufficient
  // protection for the generation endpoint.
  const method = request.method;
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    const excludedAuthRoutes = ['/api/auth/login', '/api/auth/register'];
    const isExcluded = excludedAuthRoutes.some((route) => pathname.startsWith(route));
    if (!isExcluded) {
      if (!validateCsrfToken(request)) {
        const forbiddenResponse = csrfErrorResponse();
        forbiddenResponse.headers.set('X-Request-Id', requestId);
        return forbiddenResponse;
      }
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('X-Request-Id', requestId);

  // Check if route is public
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    // If already authenticated, redirect to dashboard
    if (token) {
      const decoded = await verifyTokenBasic(token);
      if (decoded && (pathname === "/login" || pathname === "/register")) {
        const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));
        redirectResponse.headers.set('X-Request-Id', requestId);
        return redirectResponse;
      }
    }
    return response;
  }

  // Check if route is protected
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!token) {
      const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
      redirectResponse.headers.set('X-Request-Id', requestId);
      return redirectResponse;
    }

    const decoded = await verifyTokenBasic(token);
    if (!decoded) {
      const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
      redirectResponse.cookies.set("auth-token", "", { path: "/", maxAge: 0 });
      redirectResponse.headers.set('X-Request-Id', requestId);
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/tts|api/generate|api/embed).*)",
  ],
};

