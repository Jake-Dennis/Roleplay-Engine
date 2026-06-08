import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";

/**
 * POST /api/wiki/text/expand
 * Expand selected wiki text with more detail.
 * Body: { text: string, context?: string }
 * Returns: { result: string }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { text, context } = await request.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text field" }, { status: 400 });
  }

  const result = await generateText(PROMPTS.wikiExpandText(text, context), { userId });

  return NextResponse.json({ result });
});
