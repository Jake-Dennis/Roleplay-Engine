import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { withAuth } from '@/lib/with-auth';

/**
 * POST /api/generate/[id]/regenerate-choices
 *
 * Regenerates the 4 branching narrative choices for the latest exchange
 * in a session without re-running the full generation stream. Returns
 * fresh JSON {"options": [...]} from Ollama.
 *
 * The server looks up the most recent user message and AI response in
 * the session and feeds them to the generateChoices prompt template.
 *
 * @param request - The incoming Next.js request
 * @param params - Route parameters containing the session id
 * @returns JSON with choices array
 * @throws 401 - If authentication fails
 * @throws 404 - If session is not found or has no messages
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { id: sessionId } = await params;
  const db = getDb();

  // Verify session access
  const session = db.prepare(`
    SELECT s.id FROM sessions s
    WHERE s.id = ? AND (s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
  `).get(sessionId, userId, userId) as { id: string } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get the most recent user message
  const userMsg = db.prepare(`
    SELECT content FROM messages
    WHERE session_id = ? AND sender_id IS NOT NULL AND is_deleted = 0
    ORDER BY timestamp DESC LIMIT 1
  `).get(sessionId) as { content: string } | undefined;

  // Get the most recent AI message
  const aiMsg = db.prepare(`
    SELECT content FROM messages
    WHERE session_id = ? AND sender_id IS NULL AND is_deleted = 0
    ORDER BY timestamp DESC LIMIT 1
  `).get(sessionId) as { content: string } | undefined;

  if (!userMsg || !aiMsg) {
    return NextResponse.json(
      { error: "No messages to generate choices from" },
      { status: 400 }
    );
  }

  // Generate fresh choices via Ollama
  try {
    const choicesPrompt = PROMPTS.generateChoices(userMsg.content, aiMsg.content);
    const choicesRaw = await generateText(choicesPrompt, {
      userId,
      temperature: 0.8,
      top_p: 0.9,
    });
    const choicesParsed = JSON.parse(choicesRaw) as { options: string[] };
    const options = choicesParsed?.options && Array.isArray(choicesParsed.options)
      ? choicesParsed.options
      : [];

    return NextResponse.json({ choices: options });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate choices" },
      { status: 500 }
    );
  }
}
