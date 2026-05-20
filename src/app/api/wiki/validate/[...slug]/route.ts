import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { validatePage } from "@/lib/wiki/validation";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import path from "path";
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';
import { unauthorizedError, notFoundError, badRequestError } from '@/lib/error-response';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const joined = slug.join("/");
  const relativePath = joined.endsWith(".md") ? joined : `${joined}.md`;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return badRequestError("Invalid path");
  }

  if (!fs.existsSync(fullPath)) {
    return notFoundError("Wiki page");
  }

  try {
    const result = await validatePage(fullPath);
    if (!result) {
      return badRequestError("Page is not in draft state");
    }
    return NextResponse.json({ success: true, status: "reviewed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
