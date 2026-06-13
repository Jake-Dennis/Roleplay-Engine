import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { getServerConfig } from "@/lib/server-config";
import { fetchLocalModels } from "@/lib/ollama";
import fs from "fs";
import path from "path";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult.auth;

    const universeId = (await params).id;
  const db = getDb();
  const cfg = getServerConfig();

  // Verify universe access (owner)
  const universe = db.prepare(
    `SELECT u.id, u.user_id, u.name
     FROM universes u
     WHERE u.id = ? AND u.user_id = ?`
  ).get(universeId, userId) as { id: string; user_id: string; name: string } | undefined;

  if (!universe) {
    return NextResponse.json({ error: "Universe not found" }, { status: 404 });
  }

  // ── Model info ──────────────────────────────────────────────────────

  const model = cfg.ollama.model || "unknown";
  const contextWindow = cfg.modelDefaults?.[model]?.numCtx || 131072;
  const choicesModel = cfg.ollama.choicesModel || null;
  const embeddingModel = cfg.ollama.embeddingModel || null;

  let availableModels: string[] = [];
  try {
    const models = await fetchLocalModels();
    availableModels = models;
  } catch {
    // Non-fatal — availableModels stays empty
  }

  // ── Stats from DB ───────────────────────────────────────────────────

  const totalSessions = (
    db.prepare(
      "SELECT COUNT(*) as count FROM sessions WHERE universe_id = ? AND owner_id = ?"
    ).get(universeId, userId) as { count: number }
  ).count;

  const totalMessages = (
    db.prepare(
      `SELECT COUNT(*) as count
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.universe_id = ? AND s.owner_id = ? AND m.is_deleted = 0`
    ).get(universeId, userId) as { count: number }
  ).count;

  const totalThreads = (
    db.prepare(
      "SELECT COUNT(*) as count FROM narrative_threads WHERE universe_id = ? AND user_id = ?"
    ).get(universeId, userId) as { count: number }
  ).count;

  const totalRelationships = (
    db.prepare(
      "SELECT COUNT(*) as count FROM relationships WHERE universe_id = ? AND user_id = ?"
    ).get(universeId, userId) as { count: number }
  ).count;

  const totalMemories = (
    db.prepare(
      "SELECT COUNT(*) as count FROM narrative_memories WHERE universe_id = ? AND user_id = ?"
    ).get(universeId, userId) as { count: number }
  ).count;

  // ── Wiki page count (count .md files in data/{userId}/wiki/) ────────

  let totalWikiPages = 0;
  try {
    const wikiRoot = path.join(process.cwd(), "data", userId, "wiki");
    if (fs.existsSync(wikiRoot)) {
      const walkDir = (dir: string): void => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.name.endsWith(".md")) {
            totalWikiPages++;
          }
        }
      };
      walkDir(wikiRoot);
    }
  } catch {
    // Non-fatal
  }

  // ── Context metrics — estimate with actual data ─────────────────────

  const overheadTokens = 500; // system prompt + instructions

  // All non-deleted messages
  const recentMessages = db.prepare(
    `SELECT content FROM messages m
     JOIN sessions s ON s.id = m.session_id
     WHERE s.universe_id = ? AND s.owner_id = ? AND m.is_deleted = 0
     ORDER BY m.timestamp DESC`
  ).all(universeId, userId) as { content: string }[];

  let msgTokens = 0;
  for (const msg of recentMessages) {
    msgTokens += estimateTokens(msg.content);
  }

  // Wiki page content as lore
  let loreTokens = 0;
  let loreCount = 0;
  try {
    const wikiRoot = path.join(process.cwd(), "data", userId, "wiki");
    if (fs.existsSync(wikiRoot)) {
      const walkDir = (dir: string): void => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.name.endsWith(".md")) {
            loreCount++;
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              loreTokens += estimateTokens(content);
            } catch {
              // skip unreadable files
            }
          }
        }
      };
      walkDir(wikiRoot);
    }
  } catch {
    // Non-fatal
  }
  // In practice only a subset of wiki pages are retrieved as lore
  const estimatedLoreTokens = Math.round(loreTokens * 0.3);

  // Narrative memories (importance-ranked, capped)
  const memories = db.prepare(
    "SELECT content FROM narrative_memories WHERE universe_id = ? AND user_id = ? ORDER BY created_at DESC"
  ).all(universeId, userId) as { content: string }[];

  let memTokens = 0;
  let memCount = 0;
  for (const mem of memories) {
    const t = estimateTokens(mem.content);
    if (memTokens + t > 2000 && memCount > 0) break; // typical memory budget
    memTokens += t;
    memCount++;
  }

  // Relationships
  const rels = db.prepare(
    "SELECT source_entity, target_entity, emotional_state FROM relationships WHERE universe_id = ? AND user_id = ?"
  ).all(universeId, userId) as { source_entity: string; target_entity: string; emotional_state: string | null }[];

  let relTokens = 0;
  for (const rel of rels) {
    relTokens += estimateTokens(rel.source_entity + rel.target_entity + (rel.emotional_state || ""));
  }

  // Narrative threads
  const threads = db.prepare(
    "SELECT title, description FROM narrative_threads WHERE universe_id = ? AND user_id = ?"
  ).all(universeId, userId) as { title: string; description: string | null }[];

  let threadTokens = 0;
  for (const thread of threads) {
    threadTokens += estimateTokens(thread.title + (thread.description || ""));
  }

  // ── Build response ──────────────────────────────────────────────────

  const totalUsed = overheadTokens + msgTokens + estimatedLoreTokens + memTokens + relTokens + threadTokens;
  const freeTokens = Math.max(0, contextWindow - totalUsed);

  const sections = {
    overhead: { tokens: overheadTokens, label: "System Prompt + Instructions", count: null },
    messages: { tokens: msgTokens, label: "Recent History", count: recentMessages.length },
    lore: { tokens: estimatedLoreTokens, label: "Known World / Lore", count: loreCount },
    memories: { tokens: memTokens, label: "Narrative Memories", count: memCount },
    relationships: { tokens: relTokens, label: "Relationships", count: rels.length },
    threads: { tokens: threadTokens, label: "Narrative Threads", count: threads.length },
  };

  return NextResponse.json({
    universe: {
      id: universeId,
      name: universe.name,
    },
    model: {
      name: model,
      contextWindow,
      choicesModel,
      embeddingModel,
      availableModels,
    },
    context: {
      totalPrompt: totalUsed,
      freeTokens,
      sections,
    },
    stats: {
      totalMessages,
      totalSessions,
      totalWikiPages,
      totalNarrativeThreads: totalThreads,
      totalRelationships,
      totalMemories,
    },
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
