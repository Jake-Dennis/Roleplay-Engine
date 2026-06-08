/**
 * CSRF Protection — Double Submit Cookie pattern.
 *
 * Flow:
 * 1. Login endpoint generates a CSRF token, sets it as a non-httpOnly cookie,
 *    and returns it in the response body.
 * 2. Client-side JS reads the token and sends it as X-CSRF-Token header
 *    on every mutating request (POST, PUT, DELETE).
 * 3. Edge middleware validates that the header matches the cookie value.
 *
 * Why this works: cross-origin attackers can read the cookie (non-httpOnly)
 * but cannot set the X-CSRF-Token header due to CORS preflight restrictions
 * on non-standard headers.
 */

import { NextRequest, NextResponse } from "next/server";

/** The HTTP header name for the CSRF token. */
export const CsrfTokenHeader = "X-CSRF-Token";

/** The cookie name for the CSRF token. */
export const CsrfCookieName = "csrf-token";

/**
 * Generate a cryptographically random CSRF token.
 * Uses crypto.randomUUID() for a v4 UUID (128 bits of entropy).
 */
export function generateCsrfToken(): string {
  return crypto.randomUUID();
}

/**
 * Set the CSRF token as a non-httpOnly cookie on the given response.
 * - non-httpOnly: client-side JS can read it for inclusion in headers
 * - SameSite: Lax — blocks cross-site POST form submissions (defense in depth)
 * - Secure: true in production, false in dev (localhost)
 * - Path: / — available on all routes
 *
 * @param response - The NextResponse to set the cookie on
 * @param token - The CSRF token value
 */
export function setCsrfCookie(response: NextResponse, token: string): void {
  const isSecure = process.env.NODE_ENV === "production";

  response.cookies.set(CsrfCookieName, token, {
    httpOnly: false,   // JS must be able to read it
    secure: isSecure,
    sameSite: "lax",   // Defense in depth: block cross-site POST form submissions
    maxAge: 60 * 60 * 24, // 24 hours (matches JWT expiry)
    path: "/",
  });
}

/**
 * Validate that the X-CSRF-Token header matches the csrf-token cookie.
 * Returns true if both values are present and match, or if no CSRF cookie
 * exists (no session to protect).
 *
 * If the cookie exists but the header is missing or doesn't match,
 * returns false — the request is likely a forged cross-origin request.
 *
 * @param request - The incoming NextRequest
 * @returns true if valid or no CSRF state exists, false on mismatch
 */
export function validateCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CsrfCookieName)?.value;
  const headerToken = request.headers.get(CsrfTokenHeader);

  // No CSRF cookie → no session, nothing to protect. Allow through
  // (the route handler's auth check will reject unauthenticated requests).
  if (!cookieToken) {
    return true;
  }

  // Cookie exists but no header → probable CSRF attack
  if (!headerToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(cookieToken, headerToken);
}

/**
 * Create a 403 response for CSRF validation failures.
 */
export function csrfErrorResponse(): NextResponse {
  return NextResponse.json(
    { error: "CSRF token validation failed" },
    { status: 403 }
  );
}

/**
 * Constant-time string comparison using Web Crypto API.
 * Prevents timing side-channel attacks on token comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Manual constant-time comparison using XOR reduction.
  // This runs in O(n) time regardless of where the first difference occurs,
  // preventing timing side-channel attacks on token comparison.
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

