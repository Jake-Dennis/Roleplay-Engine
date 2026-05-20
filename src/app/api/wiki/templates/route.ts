import { NextRequest, NextResponse } from "next/server";
import { getAuthToken } from "@/lib/auth-token";
import { verifyToken } from "@/lib/auth";
import path from "path";
import fs from "fs";

const TEMPLATES_DIR = path.join(process.cwd(), "src/lib/wiki/templates");

/**
 * Parse frontmatter from a markdown template string.
 */
function parseTemplateFrontmatter(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) return {};
  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return {};
  const fmBlock = trimmed.slice(3, endIdx).trim();
  const frontmatter: Record<string, unknown> = {};
  for (const line of fmBlock.split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*(.*)/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (value === "[]") {
        frontmatter[key] = [];
      } else {
        frontmatter[key] = value;
      }
    }
  }
  return frontmatter;
}

/**
 * Extract the body content (after frontmatter) from a template.
 */
function parseTemplateBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) return trimmed;
  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return trimmed;
  return trimmed.slice(endIdx + 3).trim();
}

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  if (!fs.existsSync(TEMPLATES_DIR)) {
    return NextResponse.json({ templates: [] });
  }

  const files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".md"));

  const templates = files.map((file) => {
    const raw = fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf-8");
    const frontmatter = parseTemplateFrontmatter(raw);
    const body = parseTemplateBody(raw);
    const name = file.replace(".md", "");

    // Generate a short preview from the first heading
    const firstHeading = body.match(/^#\s+(.+)$/m);
    const preview = firstHeading ? firstHeading[1] : name;

    return {
      name,
      title: (frontmatter.title as string) ?? name,
      type: (frontmatter.type as string) ?? "entity",
      preview,
      content: raw,
    };
  });

  return NextResponse.json({ templates });
}
