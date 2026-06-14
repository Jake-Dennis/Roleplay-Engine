import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getDb } from '@/lib/db';

/**
 * GET /api/personas
 * List player characters (personas) — entity_registry entries with
 * entity_type='persona' scoped to a universe. Any user in the universe
 * can see and use these personas.
 *
 * @param request - The incoming Next.js request object (?universe_id= required)
 * @returns NextResponse with { personas: { id, name, description, createdAt }[] }
 * @throws 401 - If authentication fails
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get('universe_id');

  // universe_id is required — personas are always scoped to a universe
  if (!universeId) {
    return NextResponse.json({ personas: [] });
  }

  const db = getDb();
  const rows = db.prepare(
    "SELECT id, display_name, description, created_at FROM entity_registry WHERE entity_type = 'persona' AND universe_id = ? ORDER BY created_at ASC"
  ).all(universeId) as { id: string; display_name: string; description: string | null; created_at: string }[];

  const personas = rows.map(r => ({
    id: r.id,
    name: r.display_name,
    description: r.description || null,
    entity_id: r.id,
    createdAt: r.created_at || null,
  }));

  return NextResponse.json({ personas });
});
