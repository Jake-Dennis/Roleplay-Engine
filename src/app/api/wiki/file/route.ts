import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { fileAnswer } from "@/lib/wiki/filing";
import path from "path";
import { getAuthToken } from '@/lib/auth-token';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { query, answer, citations, universeId } = body;

  if (!query || !answer || !Array.isArray(citations) || !universeId) {
    return NextResponse.json(
      { error: "query, answer, citations (array), and universeId are required" },
      { status: 400 }
    );
  }

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

  try {
    const result = await fileAnswer(query, answer, citations, wikiRoot, universeId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
