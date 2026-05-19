import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { ingestSource } from "@/lib/wiki/ingest";
import path from "path";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { sourcePath, universeId } = body;

  if (!sourcePath || !universeId) {
    return NextResponse.json(
      { error: "sourcePath and universeId are required" },
      { status: 400 }
    );
  }

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

  try {
    const result = await ingestSource(sourcePath, wikiRoot, universeId);
    return NextResponse.json({
      success: true,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
