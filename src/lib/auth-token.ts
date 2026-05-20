/**
 * Extract auth token from request.
 * Reads the httpOnly auth-token cookie.
 */

import { NextRequest } from "next/server";

export function getAuthToken(request: NextRequest): string | undefined {
  return request.cookies.get("auth-token")?.value || undefined;
}
