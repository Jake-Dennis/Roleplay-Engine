import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { listWikiPages } from '@/lib/wiki/file-io';

/**
 * GET /api/personas/{id}
 * Get a single persona by entity_id (e.g. "persona:uuid") or by name.
 * Reads from wiki pages with type=entity and subtype=character.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the persona entity_id
 * @returns NextResponse with { persona: { id, name, description, ... } }
 * @throws 401 - If authentication fails
 * @throws 404 - If persona not found
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const { id } = await params;

  try {
    const wikiRoot = getWikiRoot(userId);
    const allPages = listWikiPages(wikiRoot);

    const character = allPages.find(p =>
      p.frontmatter.type === 'entity' &&
      p.frontmatter.subtype === 'character' &&
      (p.frontmatter.entity_id === id || p.frontmatter.title === id)
    );

    if (!character) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    const fm = character.frontmatter;
    const persona = {
      id: (fm.entity_id as string) || fm.title,
      name: fm.title,
      description: character.content || null,
      entity_id: fm.entity_id || null,
      createdAt: fm.created || null,
    };

    return NextResponse.json({ persona });
  } catch {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }
});
