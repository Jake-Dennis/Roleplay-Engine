import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { readWikiPage } from "@/lib/wiki/file-io";
import { checkPageSize, suggestSplit } from "@/lib/wiki/page-split";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import path from "path";
import fs from "fs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { slug } = await params;
  const joined = slug.join("/");
  const relativePath = joined.endsWith(".md") ? joined : `${joined}.md`;
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const fullPath = path.join(wikiRoot, relativePath);

  if (!isPathWithinRoot(fullPath, wikiRoot)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  if (!fs.existsSync(fullPath)) return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });

  const page = readWikiPage(fullPath);
  const pageSize = checkPageSize(page.content);
  const splitSuggestion = suggestSplit(fullPath, page.content);

  return NextResponse.json({ pageSize, splitSuggestion });
}
