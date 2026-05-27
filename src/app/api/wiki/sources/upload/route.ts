import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import path from "path";
import fs from "fs";
import { serverError, requireJson } from '@/lib/error-response';
import { validateLength } from '@/lib/validation';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".xml", ".pdf",
]);

/**
 * POST /api/wiki/sources/upload
 *
 * Uploads a source document file to the wiki's raw storage directory.
 * Validates filename, file extension (.txt, .md, .csv, .json, .xml, .pdf),
 * content size (max 10MB), and prevents path traversal.
 *
 * @param request - The incoming Next.js request object with JSON body { filename, content, universeId? }
 * @returns NextResponse with { success: true, filename, size }
 * @throws 400 - If filename or content is missing, or filename is invalid
 * @throws 401 - If authentication fails
 * @throws 413 - If content exceeds the maximum file size
 * @throws 415 - If file extension is not allowed
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If writing the file fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  cleanupExpiredEntries();
  const limit = checkRateLimit(`upload:${userId}`, "upload");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { filename, content, universeId } = body;

  if (!filename || content === undefined || content === null) {
    return NextResponse.json(
      { error: "filename and content are required" },
      { status: 400 }
    );
  }

  const contentError = validateLength(String(content), 100000, "Content");
  if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });

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

  const wikiRoot = getWikiRoot(userId, universeId);
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
  } catch (err: unknown) {
    return serverError(err);
  }
}
