import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { discoverVoices } from "@/lib/voice-discovery";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  try {
    const voices = await discoverVoices();
    return NextResponse.json({
      success: true,
      voices,
      count: voices.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to discover voices", success: false },
      { status: 500 }
    );
  }
}
