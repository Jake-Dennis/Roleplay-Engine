import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { getRecentLogs } from "@/lib/wiki/logger";
import path from "path";
import { getAuthToken } from '@/lib/auth-token';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const count = parseInt(request.nextUrl.searchParams.get("count") || "5", 10);

  try {
    const logs = getRecentLogs(wikiRoot, count);
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
