import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { discoverVoices } from "@/lib/voice-discovery";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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
