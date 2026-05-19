import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import path from "path";
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".xml", ".pdf",
]);

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  cleanupExpiredEntries();
  const limit = checkRateLimit(`upload:${decoded.sub}`, "upload");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

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

  // Extension check (defense in depth)
  const ext = path.extname(safeFilename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `File extension not allowed. Allowed: .txt, .md, .csv, .json, .xml, .pdf` },
      { status: 415 }
    );
  }

  // Size check (byte length of content)
  const contentSize = Buffer.byteLength(String(content), "utf-8");
  if (contentSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 }
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
