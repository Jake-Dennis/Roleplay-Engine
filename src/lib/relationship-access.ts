import { isGroupMember } from "@/lib/group-migrations";
import type { DbDatabase, DbResult } from "@/lib/types";

export function hasRelationshipAccess(db: DbDatabase, relationshipId: string, userId: string): DbResult | null {
  const rel = db.prepare(
    `SELECT r.*, u.group_id, g.owner_id as group_owner_id
     FROM relationships r
     LEFT JOIN universes u ON r.universe_id = u.id
     LEFT JOIN groups g ON u.group_id = g.id
     WHERE r.id = ?`
  ).get(relationshipId) as DbResult | undefined;

  if (!rel) return null;

  // Direct ownership
  if (rel.user_id === userId) return rel;

  // Group membership
  if (rel.group_id && isGroupMember(db, rel.group_id, userId)) return rel;

  return null;
}
