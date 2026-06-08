import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { queueJob } from "@/lib/jobs/queue";

/**
 * POST /api/wiki/generate-rumors
 * Queue a wiki_generate_rumors job for the current universe.
 * Body: { universeId?: string }
 * Returns: { jobId: string }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { universeId } = await request.json();

  const jobId = queueJob(
    userId,
    "wiki_generate_rumors",
    { userId, universeId: universeId || null },
    "medium",
    universeId
  );

  return NextResponse.json({ jobId });
});
