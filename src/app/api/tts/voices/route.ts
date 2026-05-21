import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getAvailableVoices, checkTTSConnection } from "@/lib/tts";
import { getAuthToken } from "@/lib/auth-token";
import { verifyToken } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

async function verifyAuth(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  return null;
}

export const GET = withErrorHandler(async (request: NextRequest) => { const authError = await verifyAuth(request);
if (authError) return authError;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

// Try to refresh voices if not yet loaded
const voices = getAvailableVoices();
if (voices.length === 0) {
  await checkTTSConnection();
}

const updatedVoices = getAvailableVoices();

return NextResponse.json({
  voices: updatedVoices.map((v) => v.id),
  voiceDetails: updatedVoices,
}); });

export const POST = withErrorHandler(async (request: NextRequest) => { const authError = await verifyAuth(request);
if (authError) return authError;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

await checkTTSConnection();
const voices = getAvailableVoices();

return NextResponse.json({
  voices: voices.map((v) => v.id),
  voiceDetails: voices,
}); });
