import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { readWikiPage } from "@/lib/wiki/file-io";
import { listRevisions, saveRevision, getRevision } from "@/lib/wiki/revisions";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import path from "path";
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const searchParams = request.nextUrl.searchParams;
  const slugParam = searchParams.get("slug");
  const revisionId = searchParams.get("id");

  if (!slugParam) {
    return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
  }

  const slug = slugParam.split("/");
  const relativePath = slugParam.endsWith(".md") ? slugParam : `${slugParam}.md`;
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  // If ?id= is provided, return a specific revision
  if (revisionId) {
    const revision = getRevision(wikiRoot, slug, revisionId);
    if (!revision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }
    return NextResponse.json({ revision });
  }

  const revisions = listRevisions(wikiRoot, slug);
  return NextResponse.json({ revisions });
}

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const searchParams = request.nextUrl.searchParams;
  const slugParam = searchParams.get("slug");

  if (!slugParam) {
    return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
  }

  const slug = slugParam.split("/");
  const relativePath = slugParam.endsWith(".md") ? slugParam : `${slugParam}.md`;
  const fullPath = path.join(wikiRoot, relativePath);

  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  try {
    const existing = readWikiPage(fullPath);
    const revision = saveRevision(wikiRoot, slug, existing.content, existing.frontmatter);
    return NextResponse.json({ success: true, revision });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
