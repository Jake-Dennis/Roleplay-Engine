import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { queueJob } from "@/lib/jobs/queue";

/**
 * POST /api/wiki/deepen
 * Queue a wiki_deepen_page job for the current page.
 * Body: { universeId?: string, pagePath?: string }
 * Returns: { jobId: string }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { universeId, pagePath } = await request.json();

  const jobId = queueJob(
    userId,
    "wiki_deepen_page",
    { userId, universeId: universeId || null, pagePath: pagePath || null },
    "medium",
    universeId
  );

  return NextResponse.json({ jobId });
});
