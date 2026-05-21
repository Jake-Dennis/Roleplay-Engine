import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { getRecentLogs } from "@/lib/wiki/logger";
import path from "path";
import { getAuthToken } from '@/lib/auth-token';
import { serverError } from '@/lib/error-response';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const count = parseInt(request.nextUrl.searchParams.get("count") || "5", 10);

  try {
    const logs = getRecentLogs(wikiRoot, count);
    return NextResponse.json({ logs });
  } catch (err: unknown) {
    return serverError(err);
  }
}
