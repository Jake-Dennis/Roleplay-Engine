/**
 * Extract auth token from request.
 * Checks cookie first, then falls back to x-auth-token header
 * for IP-based access where cookies may not work.
 */

import { NextRequest } from "next/server";

export function getAuthToken(request: NextRequest): string | undefined {
  return request.cookies.get("auth-token")?.value || request.headers.get("x-auth-token") || undefined;
}
