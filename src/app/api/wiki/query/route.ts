import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { queryWiki } from "@/lib/wiki/query";
import path from "path";
import { getAuthToken } from '@/lib/auth-token';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { query, universeId } = body;

  if (!query || !universeId) {
    return NextResponse.json(
      { error: "query and universeId are required" },
      { status: 400 }
    );
  }

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

  try {
    const result = await queryWiki(query, wikiRoot, universeId);
    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      usedFallback: result.usedFallback,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
