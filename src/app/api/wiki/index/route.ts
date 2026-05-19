import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { generateIndex } from "@/lib/wiki/index-generator";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const indexPath = path.join(wikiRoot, "index.md");

  try {
    if (!fs.existsSync(indexPath)) {
      generateIndex(wikiRoot);
    }
    const index = fs.readFileSync(indexPath, "utf-8");
    return NextResponse.json({ index });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
