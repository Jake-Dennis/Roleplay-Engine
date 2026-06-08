"use client";

/**
 * RetrievalInspector — Debug overlay that shows what context was retrieved
 * for the current session. Toggle with Ctrl+Shift+R.
 *
 * Sections displayed:
 *   - Budget-tracked: messages, lore, relationships, memories, threads, summaries, decision points
 *   - Untracked: scene, entities, evolution, anchors, canon, narrative state, intent
 *
 * Each budget-tracked section shows per-item token cost and omitted indicators.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Bug,
  X,
  ChevronDown,
  ChevronRight,
  BarChart3,
  MessageSquare,
  BookOpen,
  Heart,
  BrainCircuit,
  GitBranch,
  FileText,
  ListChecks,
  MapPin,
  Users,
  History,
  Anchor,
  Globe,
  Target,
  Layers,
  Loader2,
} from "lucide-react";
import type {
  RetrievedContext,
  RetrievalInspectorResponse,
  BudgetBreakdown,
  SectionBudget,
} from "@/lib/retrieval";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RetrievalInspectorProps {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RetrievalInspector({ sessionId }: RetrievalInspectorProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [data, setData] = useState<RetrievalInspectorResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    overview: true,
    messages: true,
  });

  // Load visibility from localStorage on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = localStorage.getItem("retrieval-inspector-visible");
      if (stored === "true") setVisible(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keyboard shortcut: Ctrl+Shift+R
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setVisible((prev) => {
          const next = !prev;
          localStorage.setItem("retrieval-inspector-visible", String(next));
          return next;
        });
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && visible) {
        setVisible(false);
        localStorage.setItem("retrieval-inspector-visible", "false");
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [visible]);

  // Fetch data when panel becomes visible
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      setFetchError(null);
      fetch(`/api/sessions/${sessionId}/retrieval-context`)
        .then((res) => {
          if (!res.ok) return res.json().then((j) => Promise.reject(j.error || "Failed to fetch"));
          return res.json();
        })
        .then((json: RetrievalInspectorResponse) => {
          requestAnimationFrame(() => {
            setData(json);
            setLoading(false);
          });
        })
        .catch((err: unknown) => {
          requestAnimationFrame(() => {
            setFetchError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          });
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, sessionId]);

  const close = useCallback(() => {
    setVisible(false);
    localStorage.setItem("retrieval-inspector-visible", "false");
  }, []);

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!visible) return null;

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l border-border-default bg-bg-base/95 shadow-2xl backdrop-blur-sm">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-default bg-bg-base px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <Bug className="h-3.5 w-3.5 text-accent" />
          Retrieval Inspector
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xxs text-text-muted">Ctrl+Shift+R</span>
          <button
            onClick={close}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-primary"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading retrieval context...
          </div>
        )}

        {fetchError && (
          <div className="px-3 py-4 text-xs text-error">{fetchError}</div>
        )}

        {data && (
          <div className="space-y-1 px-2 py-2">
            {/* Budget Overview */}
            {renderBudgetOverview(data.budget, expanded, toggleSection)}

            {/* Budget-tracked sections */}
            {renderBudgetSections(data, expanded, toggleSection)}

            {/* Additional context (non-budget-tracked) */}
            {renderAdditionalContext(data.context, expanded, toggleSection)}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function renderBudgetOverview(
  budget: BudgetBreakdown,
  expanded: Record<string, boolean>,
  toggle: (key: string) => void
) {
  const isOpen = expanded["overview"];
  const usedPct = Math.min(
    100,
    Math.round((budget.usedTokens / budget.availableTokens) * 100)
  );

  return (
    <div className="rounded-lg border border-border-default">
      {/* Header */}
      <button
        onClick={() => toggle("overview")}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-raised/50"
      >
        <div className="flex items-center gap-1.5">
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-text-muted" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-muted" />
          )}
          <BarChart3 className="h-3.5 w-3.5 text-accent" />
          Budget Allocation
        </div>
        <span className="text-xxs text-text-muted">
          {budget.usedTokens.toLocaleString()} /{" "}
          {budget.availableTokens.toLocaleString()} tokens
        </span>
      </button>

      {isOpen && (
        <div className="space-y-2 px-3 pb-2">
          {/* Usage bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
            <div
              className={`h-full rounded-full transition-all ${
                usedPct > 90
                  ? "bg-error"
                  : usedPct > 70
                    ? "bg-warning"
                    : "bg-success"
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_48px_56px_40px] gap-1 text-xxs text-text-muted">
            <span>Section</span>
            <span className="text-right">Items</span>
            <span className="text-right">Budget</span>
            <span className="text-right">Used</span>
          </div>
          <div className="space-y-0.5">
            {Object.entries(budget.sections).map(([key, section]) => {
              const pct = section.budgetTokens > 0
                ? Math.round((section.usedTokens / section.budgetTokens) * 100)
                : 0;
              const isOver = pct > 100;

              return (
                <div
                  key={key}
                  className="grid grid-cols-[1fr_48px_56px_40px] gap-1 text-xxs"
                >
                  <span className="truncate text-text-secondary">
                    {section.label}
                    {section.isTruncated && (
                      <span className="ml-1 text-error">⚠</span>
                    )}
                  </span>
                  <span className="text-right text-text-muted">
                    {section.isTruncated
                      ? `${section.finalCount}/${section.originalCount}`
                      : section.originalCount}
                  </span>
                  <span className="text-right text-text-muted">
                    {section.budgetTokens.toLocaleString()}
                  </span>
                  <span
                    className={`text-right ${
                      isOver
                        ? "text-error"
                        : pct > 80
                          ? "text-warning"
                          : "text-text-secondary"
                    }`}
                  >
                    {section.usedTokens.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer stats */}
          <div className="border-t border-border-default pt-1.5 text-xxs text-text-muted">
            Overhead: {budget.overhead.toLocaleString()} tokens &middot; Max:{" "}
            {budget.maxTokens.toLocaleString()} total
          </div>
        </div>
      )}
    </div>
  );
}

function renderBudgetSections(
  data: RetrievalInspectorResponse,
  expanded: Record<string, boolean>,
  toggle: (key: string) => void
) {
  const budgetSections: Array<{
    key: string;
    icon: React.ReactNode;
    getData: () => SectionBudget;
    renderItem: (item: SectionBudget["items"][number]) => React.ReactNode;
  }> = [
    {
      key: "messages",
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      getData: () => data.budget.sections["messages"],
      renderItem: (item) => (
        <span className="truncate">{item.label}</span>
      ),
    },
    {
      key: "lore",
      icon: <BookOpen className="h-3.5 w-3.5" />,
      getData: () => data.budget.sections["lore"],
      renderItem: (item) => (
        <span className="truncate">{item.label}</span>
      ),
    },
    {
      key: "relationships",
      icon: <Heart className="h-3.5 w-3.5" />,
      getData: () => data.budget.sections["relationships"],
      renderItem: (item) => (
        <span className="truncate">{item.label}</span>
      ),
    },
    {
      key: "memories",
      icon: <BrainCircuit className="h-3.5 w-3.5" />,
      getData: () => data.budget.sections["memories"],
      renderItem: (item) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{item.label}</span>
          {item.importance !== undefined && (
            <span
              className={`shrink-0 rounded px-1 py-0.5 text-xxs font-mono ${
                item.importance >= 1.5
                  ? "bg-accent/20 text-accent"
                  : item.importance >= 1.0
                    ? "bg-yellow-900/30 text-yellow-400"
                    : "bg-bg-raised text-text-muted"
              }`}
            >
              {item.importance.toFixed(2)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "narrativeThreads",
      icon: <GitBranch className="h-3.5 w-3.5" />,
      getData: () => data.budget.sections["narrativeThreads"],
      renderItem: (item) => (
        <span className="truncate">{item.label}</span>
      ),
    },
    {
      key: "messageSummaries",
      icon: <FileText className="h-3.5 w-3.5" />,
      getData: () => data.budget.sections["messageSummaries"],
      renderItem: (item) => (
        <span className="truncate">{item.label}</span>
      ),
    },
    {
      key: "decisionPoints",
      icon: <ListChecks className="h-3.5 w-3.5" />,
      getData: () => data.budget.sections["decisionPoints"],
      renderItem: (item) => (
        <span className="truncate">{item.label}</span>
      ),
    },
  ];

  return (
    <div className="space-y-1">
      {budgetSections.map(({ key, icon, getData, renderItem }) => {
        const section = getData();
        if (!section || section.originalCount === 0) return null;
        const isOpen = expanded[key] ?? false;

        return (
          <div
            key={key}
            className="rounded-lg border border-border-default"
          >
            {/* Accordion header */}
            <button
              onClick={() => toggle(key)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-raised/50"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-text-muted" />
                )}
                {icon}
                <span>{section.label}</span>
                {section.isTruncated && (
                  <span className="rounded bg-error/20 px-1 py-0.5 text-xxs font-medium text-error">
                    TRUNCATED
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xxs text-text-muted">
                <span>{section.originalCount} items</span>
                <span>
                  {section.usedTokens.toLocaleString()}t
                  {section.isTruncated && (
                    <span className="ml-1 text-error">
                      /{section.budgetTokens.toLocaleString()}t
                    </span>
                  )}
                </span>
              </div>
            </button>

            {/* Accordion body */}
            {isOpen && (
              <div className="space-y-0.5 px-3 pb-2">
                {section.items.map((item) => (
                  <div
                    key={item.index}
                    className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xxs ${
                      item.included
                        ? "text-text-secondary"
                        : "text-text-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {item.included ? (
                        <span className="shrink-0 text-success">✓</span>
                      ) : (
                        <span className="shrink-0 text-error">✗</span>
                      )}
                      {renderItem(item)}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!item.included && (
                        <span className="rounded bg-error/15 px-1 py-0.5 font-mono text-xxs text-error">
                          OMITTED
                        </span>
                      )}
                      <span className="font-mono text-text-muted">
                        {item.tokens}t
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderAdditionalContext(
  ctx: RetrievedContext,
  expanded: Record<string, boolean>,
  toggle: (key: string) => void
) {
  const additionalSections: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    count?: number;
    render: () => React.ReactNode;
  }> = [];

  // Scene state
  if (ctx.scene) {
    additionalSections.push({
      key: "scene",
      label: "Scene State",
      icon: <MapPin className="h-3.5 w-3.5" />,
      render: () => (
        <div className="space-y-1 text-xxs">
          {ctx.scene.location && (
            <Row label="Location" value={ctx.scene.location} />
          )}
          {ctx.scene.goal && <Row label="Goal" value={ctx.scene.goal} />}
          {ctx.scene.tone && <Row label="Tone" value={ctx.scene.tone} />}
          {ctx.scene.currentIntent && (
            <Row label="Intent" value={ctx.scene.currentIntent} />
          )}
          {ctx.scene.sceneType && (
            <Row label="Scene Type" value={ctx.scene.sceneType} />
          )}
          {ctx.scene.sceneTension != null && (
            <Row
              label="Tension"
              value={String(ctx.scene.sceneTension)}
            />
          )}
          {ctx.scene.conflictType && (
            <Row label="Conflict" value={ctx.scene.conflictType} />
          )}
          {ctx.scene.stakes && (
            <Row label="Stakes" value={ctx.scene.stakes} />
          )}
          {ctx.scene.activeNpcs.length > 0 && (
            <Row label="Active NPCs" value={ctx.scene.activeNpcs.join(", ")} />
          )}
          {ctx.scene.activeThreads.length > 0 && (
            <Row
              label="Active Threads"
              value={ctx.scene.activeThreads.join(", ")}
            />
          )}
        </div>
      ),
    });
  }

  // Active entities
  if (ctx.activeEntities && ctx.activeEntities.length > 0) {
    additionalSections.push({
      key: "activeEntities",
      label: "Active Entities",
      icon: <Users className="h-3.5 w-3.5" />,
      count: ctx.activeEntities.length,
      render: () => (
        <div className="flex flex-wrap gap-1 text-xxs">
          {ctx.activeEntities!.map((e) => (
            <span
              key={e}
              className="rounded bg-accent/10 px-1.5 py-0.5 text-accent"
            >
              {e}
            </span>
          ))}
        </div>
      ),
    });
  }

  // Relationship evolution
  if (ctx.relationshipEvolution && ctx.relationshipEvolution.length > 0) {
    additionalSections.push({
      key: "relationshipEvolution",
      label: "Relationship Evolution",
      icon: <History className="h-3.5 w-3.5" />,
      count: ctx.relationshipEvolution.length,
      render: () => (
        <div className="space-y-1 text-xxs">
          {ctx.relationshipEvolution!.map((e, i) => (
            <div
              key={i}
              className="rounded bg-bg-raised px-2 py-1"
            >
              <span className="text-text-secondary">
                {e.source} → {e.target}
              </span>
              {e.emotionalState && (
                <span className="ml-1 text-text-muted">
                  [{e.emotionalState}]
                </span>
              )}
              {e.triggerEvent && (
                <div className="text-text-muted">{e.triggerEvent}</div>
              )}
            </div>
          ))}
        </div>
      ),
    });
  }

  // Relationship anchors
  if (ctx.relationshipAnchors && ctx.relationshipAnchors.length > 0) {
    additionalSections.push({
      key: "relationshipAnchors",
      label: "Narrative Anchors",
      icon: <Anchor className="h-3.5 w-3.5" />,
      count: ctx.relationshipAnchors.length,
      render: () => (
        <div className="space-y-1 text-xxs">
          {ctx.relationshipAnchors!.map((a, i) => (
            <div key={i} className="rounded bg-bg-raised px-2 py-1">
              <div className="text-text-secondary">
                {a.description}{" "}
                <span className="text-accent">[{a.anchor_type}]</span>
              </div>
              {a.emotional_impact && (
                <div className="text-text-muted">{a.emotional_impact}</div>
              )}
            </div>
          ))}
        </div>
      ),
    });
  }

  // Canon context
  if (ctx.canonContext) {
    additionalSections.push({
      key: "canonContext",
      label: "Canon Context",
      icon: <Globe className="h-3.5 w-3.5" />,
      render: () => (
        <pre className="whitespace-pre-wrap break-words rounded bg-bg-raised px-2 py-1 font-mono text-xxs text-text-secondary">
          {ctx.canonContext}
        </pre>
      ),
    });
  }

  // Narrative state
  if (ctx.narrativeState) {
    additionalSections.push({
      key: "narrativeState",
      label: "Narrative State",
      icon: <Layers className="h-3.5 w-3.5" />,
      render: () => (
        <div className="space-y-1 text-xxs">
          {ctx.narrativeState!.narrativePhase && (
            <Row
              label="Phase"
              value={ctx.narrativeState!.narrativePhase}
            />
          )}
          {ctx.narrativeState!.tension != null && (
            <Row
              label="Tension"
              value={String(ctx.narrativeState!.tension)}
            />
          )}
          {ctx.narrativeState!.pacing != null && (
            <Row
              label="Pacing"
              value={String(ctx.narrativeState!.pacing)}
            />
          )}
          {ctx.narrativeState!.activeGoals && (
            <Row
              label="Goals"
              value={ctx.narrativeState!.activeGoals}
            />
          )}
          {ctx.narrativeState!.activeConflicts && (
            <Row
              label="Conflicts"
              value={ctx.narrativeState!.activeConflicts}
            />
          )}
        </div>
      ),
    });
  }

  // Intent
  if (ctx.intent) {
    additionalSections.push({
      key: "intent",
      label: "Classified Intent",
      icon: <Target className="h-3.5 w-3.5" />,
      render: () => (
        <div className="text-xxs">
          <span className="rounded bg-accent/10 px-1.5 py-0.5 font-medium text-accent uppercase">
            {ctx.intent}
          </span>
        </div>
      ),
    });
  }

  if (additionalSections.length === 0) return null;

  return (
    <div className="space-y-1 pt-2">
      <div className="px-1 py-1 text-xxs font-medium uppercase tracking-wider text-text-muted">
        Additional Context
      </div>
      {additionalSections.map(({ key, label, icon, count, render }) => {
        const isOpen = expanded[key] ?? false;

        return (
          <div
            key={key}
            className="rounded-lg border border-border-default"
          >
            <button
              onClick={() => toggle(key)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-raised/50"
            >
              <div className="flex items-center gap-1.5">
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 text-text-muted" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-text-muted" />
                )}
                {icon}
                <span>{label}</span>
              </div>
              {count !== undefined && (
                <span className="text-xxs text-text-muted">
                  {count}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="px-3 pb-2">{render()}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-text-muted">{label}:</span>
      <span className="text-text-secondary break-words">{value}</span>
    </div>
  );
}
