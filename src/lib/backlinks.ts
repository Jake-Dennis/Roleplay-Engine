/**
 * Backlink Processing
 *
 * Parses [[wikilink]] syntax from markdown content, resolves links to entity IDs,
 * and infers link types based on context patterns.
 *
 * Link Type Inference:
 * - Location name → located_in / nearby
 * - NPC name → mentions
 * - Event name → related_to
 * - "caused by", "result of" → caused_by
 * - "part of", "within" → part_of
 */

import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface Wikilink {
  name: string;
  context: string;
  position: number;
}

export interface ResolvedLink {
  name: string;
  entityType: string | null;
  entityId: string | null;
  linkType: string;
  context: string;
}

export interface Backlink {
  sourceType: string;
  sourceId: string;
  sourceName: string;
  linkType: string;
  contextSnippet: string;
}

/**
 * Parse [[wikilinks]] from markdown content
 * Returns array of links with surrounding context
 */
export function parseWikilinksFromContent(content: string): Wikilink[] {
  const links: Wikilink[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    const start = Math.max(0, match.index - 40);
    const end = Math.min(content.length, match.index + match[0].length + 40);
    const context = content.slice(start, end).replace(/\[\[|\]\]/g, "").trim();

    links.push({
      name,
      context,
      position: match.index,
    });
  }

  return links;
}

/**
 * Infer link type from context surrounding the wikilink
 */
export function inferLinkType(name: string, context: string, entityType?: string): string {
  const contextLower = context.toLowerCase();
  // Explicit patterns
  if (contextLower.includes("caused by") || contextLower.includes("result of")) {
    return "caused_by";
  }
  if (contextLower.includes("part of") || contextLower.includes("within")) {
    return "part_of";
  }
  if (contextLower.includes("near") || contextLower.includes("nearby") || contextLower.includes("close to")) {
    return "nearby";
  }
  if (contextLower.includes("located in") || contextLower.includes("inside") || contextLower.includes("at the")) {
    return "located_in";
  }
  if (contextLower.includes("related to") || contextLower.includes("connected to")) {
    return "related_to";
  }
  if (contextLower.includes("mentions") || contextLower.includes("said") || contextLower.includes("spoke")) {
    return "mentions";
  }

  // Entity-type based inference
  if (entityType) {
    switch (entityType) {
      case "location":
        return "located_in";
      case "npc":
        return "mentions";
      case "event":
        return "related_to";
      case "thread":
        return "part_of";
    }
  }

  // Default
  return "mentions";
}

/**
 * Resolve a wikilink name to an entity ID by name lookup
 */
export function resolveWikilinkFromDB(
  userId: string,
  name: string,
  universeId: string | null = null
): { entityType: string | null; entityId: string | null } {
  const db = getDb();

  // Check for persona entity first (scoped to universe)
  if (universeId) {
    const persona = db.prepare(
      "SELECT id FROM entity_registry WHERE LOWER(display_name) = LOWER(?) AND entity_type = 'persona' AND universe_id = ? LIMIT 1"
    ).get(name, universeId) as { id: string } | undefined;
    if (persona) return { entityType: "persona", entityId: persona.id };
  }

  // Search locations
  const location = db.prepare(
    "SELECT id FROM entity_registry WHERE user_id = ? AND LOWER(display_name) = LOWER(?)"
  ).get(userId, name) as { id: string } | undefined;

  if (location) return { entityType: "location", entityId: location.id };

  // Search NPCs
  const npc = db.prepare(
    "SELECT id FROM entity_registry WHERE user_id = ? AND LOWER(display_name) = LOWER(?)"
  ).get(userId, name) as { id: string } | undefined;

  if (npc) return { entityType: "npc", entityId: npc.id };

  // Search events
  const event = db.prepare(
    "SELECT id FROM entity_registry WHERE user_id = ? AND LOWER(display_name) = LOWER(?)"
  ).get(userId, name) as { id: string } | undefined;

  if (event) return { entityType: "event", entityId: event.id };

  // Search narrative threads
  const thread = db.prepare(
    "SELECT id FROM narrative_threads WHERE user_id = ? AND LOWER(title) = LOWER(?)"
  ).get(userId, name) as { id: string } | undefined;

  if (thread) return { entityType: "thread", entityId: thread.id };

  return { entityType: null, entityId: null };
}

/**
 * Parse and resolve all wikilinks in content
 */
export function parseAndResolveLinks(
  userId: string,
  content: string,
  universeId: string | null = null
): ResolvedLink[] {
  const wikilinks = parseWikilinksFromContent(content);

  return wikilinks.map((link) => {
    const resolved = resolveWikilinkFromDB(userId, link.name, universeId);
    const linkType = inferLinkType(link.name, link.context, resolved.entityType || undefined);

    return {
      name: link.name,
      entityType: resolved.entityType,
      entityId: resolved.entityId,
      linkType,
      context: link.context,
    };
  });
}

/**
 * Store backlinks in database for a source entity
 */
export function storeBacklinks(
  userId: string,
  sourceType: string,
  sourceId: string,
  sourceName: string,
  content: string,
  universeId: string | null = null
): number {
  const db = getDb();
  const links = parseAndResolveLinks(userId, content, universeId);
  let stored = 0;

  // Delete existing backlinks from this source
  db.prepare(
    "DELETE FROM backlinks WHERE user_id = ? AND source_type = ? AND source_id = ?"
  ).run(userId, sourceType, sourceId);

  // Insert new backlinks
  for (const link of links) {
    if (link.entityId) {
      try {
        db.prepare(
          "INSERT OR IGNORE INTO backlinks (id, user_id, source_type, source_id, target_type, target_id, link_type, context_snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          crypto.randomUUID(),
          userId,
          sourceType,
          sourceId,
          link.entityType,
          link.entityId,
          link.linkType,
          link.context.substring(0, 200)
        );
        stored++;
      } catch (err: unknown) {
        logger.warn("Skipped backlink DB insert", { sourceId, linkName: link.name, error: String(err) });
        // Skip duplicates or errors
      }
    }
  }

  return stored;
}

/**
 * Get backlinks for a target entity (incoming links)
 */
export function getBacklinks(
  userId: string,
  targetType: string,
  targetId: string
): Backlink[] {
  const db = getDb();

  const rows = db.prepare(
    `SELECT b.source_type as sourceType, b.source_id as sourceId, b.link_type as linkType, b.context_snippet as contextSnippet,
            CASE b.source_type
              WHEN 'location' THEN (SELECT display_name FROM entity_registry WHERE id = b.source_id)
              WHEN 'npc' THEN (SELECT display_name FROM entity_registry WHERE id = b.source_id)
              WHEN 'event' THEN (SELECT display_name FROM entity_registry WHERE id = b.source_id)
              WHEN 'thread' THEN (SELECT title FROM narrative_threads WHERE id = b.source_id)
              ELSE 'Unknown'
            END as sourceName
     FROM backlinks b
     WHERE b.user_id = ? AND b.target_type = ? AND b.target_id = ?
     ORDER BY b.created_at DESC`
  ).all(userId, targetType, targetId) as Backlink[];

  return rows;
}

/**
 * Get outgoing links from a source entity
 */
export function getOutgoingLinks(
  userId: string,
  sourceType: string,
  sourceId: string
): { targetType: string; targetId: string; targetName: string; linkType: string; contextSnippet: string }[] {
  const db = getDb();

  const rows = db.prepare(
    `SELECT b.target_type as targetType, b.target_id as targetId, b.link_type as linkType, b.context_snippet as contextSnippet,
            CASE b.target_type
              WHEN 'location' THEN (SELECT display_name FROM entity_registry WHERE id = b.target_id)
              WHEN 'npc' THEN (SELECT display_name FROM entity_registry WHERE id = b.target_id)
              WHEN 'event' THEN (SELECT display_name FROM entity_registry WHERE id = b.target_id)
              WHEN 'thread' THEN (SELECT title FROM narrative_threads WHERE id = b.target_id)
              ELSE 'Unknown'
            END as targetName
     FROM backlinks b
     WHERE b.user_id = ? AND b.source_type = ? AND b.source_id = ?
     ORDER BY b.created_at DESC`
  ).all(userId, sourceType, sourceId);

  return rows as { targetType: string; targetId: string; targetName: string; linkType: string; contextSnippet: string }[];
}
