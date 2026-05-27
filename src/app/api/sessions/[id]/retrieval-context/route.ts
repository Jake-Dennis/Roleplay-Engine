import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { getRetrievedContext } from "@/lib/retrieval";
import { PROMPT_BUDGET } from "@/lib/config";
import {
  applyContextBudget,
  estimateTokens,
} from "@/lib/prompt-builder";
import type { RetrievedContext } from "@/lib/retrieval";

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface BudgetItemInfo {
  index: number;
  label: string;
  tokens: number;
  included: boolean;
  importance?: number;
}

export interface SectionBudget {
  label: string;
  percentage: number;
  budgetTokens: number;
  usedTokens: number;
  originalCount: number;
  finalCount: number;
  isTruncated: boolean;
  items: BudgetItemInfo[];
}

export interface BudgetBreakdown {
  maxTokens: number;
  overhead: number;
  availableTokens: number;
  usedTokens: number;
  sections: Record<string, SectionBudget>;
}

export interface RetrievalInspectorResponse {
  context: RetrievedContext;
  budget: BudgetBreakdown;
}

// ---------------------------------------------------------------------------
// Budget computation helpers
// ---------------------------------------------------------------------------

function computeSectionBudget<T>(
  items: T[],
  percentage: number,
  budgetTokens: number,
  label: string,
  tokenFn: (item: T, index: number) => { tokens: number; label: string; importance?: number }
): SectionBudget {
  let used = 0;
  let includedCount = 0;
  const itemInfos: BudgetItemInfo[] = [];

  for (let i = 0; i < items.length; i++) {
    const { tokens, label: itemLabel, importance } = tokenFn(items[i], i);
    const fits = used + tokens <= budgetTokens;
    // Always include at least the first item
    const shouldInclude = fits || includedCount === 0;
    if (shouldInclude) {
      used += tokens;
      includedCount++;
    }
    itemInfos.push({
      index: i,
      label: itemLabel,
      tokens,
      included: shouldInclude,
      ...(importance !== undefined ? { importance } : {}),
    });
  }

  return {
    label,
    percentage,
    budgetTokens: Math.floor(budgetTokens),
    usedTokens: used,
    originalCount: items.length,
    finalCount: includedCount,
    isTruncated: includedCount < items.length,
    items: itemInfos,
  };
}

function computeBudgetBreakdown(ctx: RetrievedContext): BudgetBreakdown {
  const maxTokens = 6000;
  const overhead = PROMPT_BUDGET.OVERHEAD;
  const available = maxTokens - overhead;

  // Also compute used tokens on the budgeted version for reporting
  const budgetedCtx: RetrievedContext = JSON.parse(JSON.stringify(ctx));
  const applied = applyContextBudget(budgetedCtx, maxTokens);

  const sections: Record<string, SectionBudget> = {};

  // Messages
  const msgBudget = Math.floor(available * PROMPT_BUDGET.MESSAGES);
  const msgTokens = estimateTokens(
    applied.recentMessages.messages.map((m) => m.content).join(" ")
  );
  sections["messages"] = computeSectionBudget(
    ctx.recentMessages.messages,
    PROMPT_BUDGET.MESSAGES,
    msgBudget,
    "Recent Messages",
    (m) => ({
      tokens: estimateTokens(m.content),
      label: `[${m.senderId === null ? "AI" : "User"}] ${m.content.substring(0, 80)}${m.content.length > 80 ? "..." : ""}`,
    })
  );

  // Lore (wiki entries)
  const loreBudget = Math.floor(available * PROMPT_BUDGET.LORE);
  sections["lore"] = computeSectionBudget(
    ctx.lore.entries,
    PROMPT_BUDGET.LORE,
    loreBudget,
    "Wiki Lore",
    (e) => ({
      tokens: estimateTokens(e.name + e.description),
      label: `${e.name} (${e.type})`,
    })
  );

  // Relationships
  const relBudget = Math.floor(available * PROMPT_BUDGET.RELATIONSHIPS);
  sections["relationships"] = computeSectionBudget(
    ctx.relationships.relationships,
    PROMPT_BUDGET.RELATIONSHIPS,
    relBudget,
    "Relationships",
    (r) => ({
      tokens: estimateTokens(r.source + r.target + (r.state || "")),
      label: `${r.source} → ${r.target}${r.state ? ` [${r.state}]` : ""}`,
    })
  );

  // Memories
  const memBudget = Math.floor(available * PROMPT_BUDGET.MEMORIES);
  const memEntries = ctx.memories?.entries ?? [];
  sections["memories"] = computeSectionBudget(
    memEntries,
    PROMPT_BUDGET.MEMORIES,
    memBudget,
    "Memories",
    (m) => ({
      tokens: estimateTokens(m.content),
      label: `[${m.type}] ${m.content.substring(0, 80)}${m.content.length > 80 ? "..." : ""}`,
      importance: typeof m.importance === "number" ? m.importance : undefined,
    })
  );

  // Narrative threads
  const threadBudget = Math.floor(available * PROMPT_BUDGET.ACTIVE_THREADS);
  const threadEntries = ctx.narrativeThreads ?? [];
  sections["narrativeThreads"] = computeSectionBudget(
    threadEntries,
    PROMPT_BUDGET.ACTIVE_THREADS,
    threadBudget,
    "Narrative Threads",
    (t) => ({
      tokens: estimateTokens(t.title + (t.description || "")),
      label: `${t.title} [${t.status}]`,
    })
  );

  // Message summaries (pass-through in budget, compute token usage)
  const summaryBudget = Math.floor(available * PROMPT_BUDGET.MESSAGE_SUMMARIES);
  const summaryEntries = ctx.messageSummaries ?? [];
  sections["messageSummaries"] = computeSectionBudget(
    summaryEntries,
    PROMPT_BUDGET.MESSAGE_SUMMARIES,
    summaryBudget,
    "Message Summaries",
    (s) => ({
      tokens: estimateTokens(s.summary),
      label: `[${s.type}] ${s.summary.substring(0, 80)}${s.summary.length > 80 ? "..." : ""}`,
    })
  );

  // Decision points
  const dpBudget = Math.floor(available * PROMPT_BUDGET.DECISION_POINTS);
  const dpEntries = ctx.decisionPoints ?? [];
  sections["decisionPoints"] = computeSectionBudget(
    dpEntries,
    PROMPT_BUDGET.DECISION_POINTS,
    dpBudget,
    "Decision Points",
    (d) => ({
      tokens: estimateTokens(d.prompt + (d.context || "") + d.choicesMade.join(", ")),
      label: d.prompt.substring(0, 80) + (d.prompt.length > 80 ? "..." : ""),
    })
  );

  // Count total used tokens from budgeted context
  const totalUsed =
    msgTokens +
    estimateTokens(applied.lore.entries.map((e) => e.name + e.description).join(" ")) +
    estimateTokens(applied.relationships.relationships.map((r) => r.source + r.target + (r.state || "")).join(" ")) +
    estimateTokens(applied.memories?.entries.map((m) => m.content).join(" ") ?? "") +
    estimateTokens(applied.narrativeThreads?.map((t) => t.title + (t.description || "")).join(" ") ?? "") +
    estimateTokens(applied.messageSummaries?.map((s) => s.summary).join(" ") ?? "") +
    estimateTokens(applied.decisionPoints?.map((d) => d.prompt + (d.context || "") + d.choicesMade.join(", ")).join(" ") ?? "");

  return {
    maxTokens,
    overhead,
    availableTokens: available,
    usedTokens: totalUsed,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/sessions/[id]/retrieval-context
 *
 * Debug/inspection endpoint that returns the full retrieval context
 * and budget breakdown for a session. Shows exactly what context would
 * be assembled for generation, including messages, lore, relationships,
 * memories, narrative threads, and decision points with token budgets.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { context: RetrievedContext, budget: BudgetBreakdown }
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 500 - If retrieval context computation fails
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const { id: sessionId } = await params;
  const db = getDb();

  // Verify session access
  const session = db.prepare(
    `SELECT id, universe_id FROM sessions
     WHERE id = ? AND (owner_id = ? OR id IN (
       SELECT session_id FROM session_participants WHERE user_id = ?
     ))`
  ).get(sessionId, userId, userId) as {
    id: string;
    universe_id: string | null;
  } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const universeId = session.universe_id || "";
    const fullContext = await getRetrievedContext(sessionId, universeId, "");
    const budget = computeBudgetBreakdown(fullContext);

    const response: RetrievalInspectorResponse = {
      context: fullContext,
      budget,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Failed to compute retrieval context" },
      { status: 500 }
    );
  }
}
