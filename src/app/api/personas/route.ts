import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { listWikiPages } from '@/lib/wiki/file-io';

/**
 * GET /api/personas
 * List player characters (personas) — wiki pages with subtype=character
 * whose entity_id starts with "persona:". These are user-controlled characters
 * that can be selected as the active persona in a session.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { personas: { id, name, description, createdAt }[] }
 * @throws 401 - If authentication fails
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get('universe_id');

  try {
    const wikiRoot = getWikiRoot(userId, universeId || undefined);
    const allPages = listWikiPages(wikiRoot);

    // Personas = characters with persona: entity_id prefix (player-controlled)
    const characters = allPages.filter(p => {
      if (p.frontmatter.type !== 'entity') return false;
      if (p.frontmatter.subtype !== 'character') return false;
      const eid = p.frontmatter.entity_id as string;
      // Must be a persona (player character) — entity_id starts with "persona:"
      // If no entity_id, include it (backward compat with old wiki pages)
      return !eid || eid.startsWith('persona:');
    });

    const personas = characters.map(p => ({
      id: (p.frontmatter.entity_id as string) || p.frontmatter.title,
      name: p.frontmatter.title,
      description: p.content ? p.content.substring(0, 2000) : null,
      entity_id: p.frontmatter.entity_id || null,
      createdAt: p.frontmatter.created || null,
    }));

    return NextResponse.json({ personas });
  } catch {
    return NextResponse.json({ personas: [] });
  }
});
