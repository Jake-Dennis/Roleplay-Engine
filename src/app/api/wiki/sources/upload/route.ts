import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import path from "path";
import fs from "fs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { filename, content } = body;

  if (!filename || content === undefined || content === null) {
    return NextResponse.json(
      { error: "filename and content are required" },
      { status: 400 }
    );
  }

  // Sanitize filename: strip path separators and replace dangerous characters
  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safeFilename) {
    return NextResponse.json(
      { error: "Invalid filename" },
      { status: 400 }
    );
  }

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const rawDir = path.join(wikiRoot, "raw");
  const filePath = path.join(rawDir, safeFilename);

  // Verify the resulting path is still under rawDir (path traversal check)
  if (!filePath.startsWith(rawDir)) {
    return NextResponse.json(
      { error: "Invalid filename" },
      { status: 400 }
    );
  }

  try {
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    const stats = fs.statSync(filePath);

    return NextResponse.json({
      success: true,
      filename: safeFilename,
      size: stats.size,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
