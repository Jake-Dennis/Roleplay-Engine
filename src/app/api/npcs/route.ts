import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { listWikiPages } from '@/lib/wiki/file-io';

/**
 * GET /api/npcs
 * Lists NPCs (AI-controlled characters) — wiki pages with subtype=character
 * whose entity_id starts with "npc:". These are characters controlled by the
 * LLM, as opposed to player personas.
 *
 * @param request - The incoming Next.js request object (query param: `universe_id` optional)
 * @returns NextResponse with `{ npcs }`
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

    // NPCs = characters with npc: entity_id prefix (AI-controlled)
    const characters = allPages.filter(p => {
      if (p.frontmatter.type !== 'entity') return false;
      if (p.frontmatter.subtype !== 'character') return false;
      const eid = p.frontmatter.entity_id as string;
      return eid && eid.startsWith('npc:');
    });

    const npcs = characters.map(p => ({
      id: (p.frontmatter.entity_id as string) || p.frontmatter.title,
      entityId: p.frontmatter.entity_id || null,
      name: p.frontmatter.title,
      description: p.content ? p.content.substring(0, 2000) : null,
      universeId: p.frontmatter.universe || null,
      createdAt: p.frontmatter.created || null,
    }));

    return NextResponse.json({ npcs });
  } catch {
    return NextResponse.json({ npcs: [] });
  }
});
