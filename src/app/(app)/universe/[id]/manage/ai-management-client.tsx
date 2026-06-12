"use client";

import { useEffect, useState } from "react";

interface AIMetricsData {
  universe: { id: string; name: string };
  model: {
    name: string;
    contextWindow: number;
    choicesModel: string | null;
    embeddingModel: string | null;
    messageHistoryLimit: number;
    availableModels: string[];
  };
  context: {
    totalPrompt: number;
    freeTokens: number;
    sections: Record<string, { tokens: number; label: string; count: number | null }>;
  };
  stats: {
    totalMessages: number;
    totalSessions: number;
    totalWikiPages: number;
    totalNarrativeThreads: number;
    totalRelationships: number;
    totalMemories: number;
  };
}

export function UniverseAIManagementClient({ universeId }: { universeId: string }) {
  const [data, setData] = useState<AIMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "how-it-works">("dashboard");

  useEffect(() => {
    fetch(`/api/universe/${universeId}/ai-metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch(`/api/universe/${universeId}/ai-metrics`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setData(d));
    }, 10000);

    return () => clearInterval(interval);
  }, [universeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-text-muted text-sm">Loading metrics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-text-muted text-sm">Failed to load AI metrics.</p>
      </div>
    );
  }

  const totalTokens = data.model.contextWindow;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">AI Management</h1>
          <p className="text-sm text-text-muted mt-1">{data.universe.name}</p>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-border-default bg-bg-raised p-0.5">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              activeTab === "dashboard"
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text-default"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("how-it-works")}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              activeTab === "how-it-works"
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text-default"
            }`}
          >
            How It Works
          </button>
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <DashboardTab data={data} totalTokens={totalTokens} />
      ) : (
        <HowItWorksTab />
      )}
    </div>
  );
}

function DashboardTab({ data, totalTokens }: { data: AIMetricsData; totalTokens: number }) {
  const { context, model, stats } = data;
  const sections = context.sections;

  return (
    <div className="space-y-6">
      {/* Model Card */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Current Model</p>
            <p className="text-xl font-semibold text-text-primary">{model.name}</p>
          </div>
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent font-medium">
            {totalTokens >= 100000
              ? `${(totalTokens / 1000).toFixed(0)}K context window`
              : `${(totalTokens / 1000).toFixed(0)}K context`}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
          {model.choicesModel && <span>Choices: {model.choicesModel}</span>}
          {model.embeddingModel && <span>Embeddings: {model.embeddingModel}</span>}
          <span>Message limit: {model.messageHistoryLimit}</span>
        </div>
      </div>

      {/* Context Budget Bar */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Context Budget</h2>
        <div className="h-8 w-full rounded-lg overflow-hidden flex bg-bg-raised">
          {Object.entries(sections).map(([key, section]) => {
            const pct = totalTokens > 0 ? (section.tokens / totalTokens) * 100 : 0;
            if (pct < 0.5) return null;
            return (
              <div
                key={key}
                className="h-full flex items-center justify-center text-[10px] font-medium text-white/80 transition-all relative group"
                style={{ width: `${pct}%`, backgroundColor: sectionColor(key) }}
                title={`${section.label}: ${section.tokens.toLocaleString()} tokens (${pct.toFixed(1)}%)`}
              >
                <span className="truncate px-0.5">{key === "overhead" ? "" : pct > 5 ? key : ""}</span>
              </div>
            );
          })}
          {/* Free space */}
          {context.freeTokens > 0 && (
            <div
              className="h-full flex items-center justify-center text-[10px] text-text-muted"
              style={{
                width: `${(context.freeTokens / totalTokens) * 100}%`,
                backgroundColor: "transparent",
              }}
            >
              {((context.freeTokens / totalTokens) * 100) > 8 ? "free" : ""}
            </div>
          )}
        </div>
        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3">
          {Object.entries(sections).map(([key, section]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-text-muted">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: sectionColor(key) }} />
              <span>{section.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <div className="h-2.5 w-2.5 rounded-sm border border-border-default" />
            <span>Free</span>
          </div>
        </div>
      </div>

      {/* Section Breakdown Table */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Section Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-xs text-text-muted uppercase tracking-wider">
                <th className="text-left py-2 pr-4 font-medium">Section</th>
                <th className="text-right py-2 px-4 font-medium">Tokens</th>
                <th className="text-right py-2 px-4 font-medium">% of Window</th>
                <th className="text-right py-2 pl-4 font-medium">Items</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(sections).map(([key, section]) => {
                const pct = totalTokens > 0 ? ((section.tokens / totalTokens) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={key} className="border-b border-border-default/50">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: sectionColor(key) }} />
                        <span className="text-text-primary">{section.label}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-4 text-text-primary tabular-nums">
                      {section.tokens.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-4 text-text-muted tabular-nums">{pct}%</td>
                    <td className="text-right py-2 pl-4 text-text-muted tabular-nums">
                      {section.count ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="py-2 pr-4 text-text-primary">Total Used</td>
                <td className="text-right py-2 px-4 text-text-primary tabular-nums">
                  {context.totalPrompt.toLocaleString()}
                </td>
                <td className="text-right py-2 px-4 text-text-muted tabular-nums" />
                <td className="text-right py-2 pl-4" />
              </tr>
              <tr>
                <td className="py-2 pr-4 text-text-muted">Free</td>
                <td className="text-right py-2 px-4 text-text-muted tabular-nums">
                  {context.freeTokens.toLocaleString()}
                </td>
                <td className="text-right py-2 px-4 tabular-nums">
                  <span className="text-text-muted">
                    {totalTokens > 0 ? ((context.freeTokens / totalTokens) * 100).toFixed(1) : "0.0"}%
                  </span>
                </td>
                <td className="text-right py-2 pl-4" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Wiki Pages" value={stats.totalWikiPages} />
        <StatCard label="Sessions" value={stats.totalSessions} />
        <StatCard label="Narrative Threads" value={stats.totalNarrativeThreads} />
        <StatCard label="Relationships" value={stats.totalRelationships} />
        <StatCard label="Narrative Memories" value={stats.totalMemories} />
        <StatCard label="Total Messages" value={stats.totalMessages} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-text-primary tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function HowItWorksTab() {
  return (
    <div className="space-y-8">
      {/* Pipeline Flow */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
        <h2 className="text-base font-semibold text-text-primary mb-4">Pipeline Flow</h2>
        <p className="text-sm text-text-muted mb-6">
          Every message goes through this pipeline before reaching the AI model.
        </p>

        <div className="flex flex-col items-center gap-3">
          {/* Step 1 */}
          <div className="w-full max-w-md rounded-lg border border-border-default bg-bg-raised p-3 text-center">
            <p className="text-sm font-medium text-text-primary">User sends message</p>
            <p className="text-xs text-text-muted mt-0.5">Classify intent, build context</p>
          </div>
          <ArrowDown />

          {/* Step 2 - branching */}
          <div className="w-full max-w-2xl flex gap-3">
            <div className="flex-1 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-center">
              <p className="text-sm font-medium text-text-primary">getRetrievedContext()</p>
              <p className="text-xs text-text-muted mt-0.5">Gather lore, memories, messages, threads</p>
            </div>
          </div>
          <ArrowDown />

          {/* Step 3 */}
          <div className="w-full max-w-2xl flex gap-3">
            <div className="flex-1 rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-center">
              <p className="text-sm font-medium text-text-primary">applyContextBudget()</p>
              <p className="text-xs text-text-muted mt-0.5">Dynamic allocation — non-message sections first</p>
            </div>
          </div>
          <ArrowDown />

          {/* Step 4 */}
          <div className="w-full max-w-2xl flex gap-3">
            <div className="flex-1 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
              <div className="space-y-1 text-xs">
                <p className="text-sm font-medium text-text-primary text-center mb-2">assemblePrompt()</p>
                {[
                  "[SYSTEM]        System instructions + personality",
                  "[MEMORIES]      Important narrative memories",
                  "[KNOWN WORLD]   Wiki entries (locations, NPCs, etc.)",
                  "[RELATIONSHIPS] Emotional state between characters",
                  "[RELEVANT PAST] Old messages relevant to now (RAG)",
                  "[RECENT HISTORY] Last N messages (auto-sized)",
                ].map((line) => (
                  <div key={line} className="rounded bg-bg-raised px-2 py-1 text-text-muted font-mono">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ArrowDown />

          {/* Step 5 */}
          <div className="w-full max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
            <p className="text-sm font-medium text-text-primary">Ollama generates response</p>
            <p className="text-xs text-text-muted mt-0.5">Fits in context window ✓</p>
          </div>
        </div>
      </div>

      {/* Dynamic Budget */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
        <h2 className="text-base font-semibold text-text-primary mb-3">Dynamic Context Budget</h2>
        <p className="text-sm text-text-muted mb-4">
          Instead of fixed percentage allocations, the system measures non-message sections first and gives messages whatever fits.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">Before (broken)</p>
            <div className="space-y-1.5">
              <div className="h-5 rounded bg-blue-500/30 flex items-center px-2 text-[10px] text-white/70">Messages (100%)</div>
              <div className="h-5 rounded bg-green-500/30 flex items-center px-2 text-[10px] text-white/70">Lore (100%)</div>
              <div className="h-5 rounded bg-purple-500/30 flex items-center px-2 text-[10px] text-white/70">Memories (100%)</div>
            </div>
            <p className="text-xs text-text-muted mt-2">Each section independently claims the full window → Ollama silently truncates the middle</p>
          </div>
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <p className="text-xs font-medium text-green-400 uppercase tracking-wider mb-2">After (fixed)</p>
            <div className="space-y-1.5">
              <div className="h-5 rounded bg-green-500/30 flex items-center px-2 text-[10px] text-white/70">Lore (actual)</div>
              <div className="h-5 rounded bg-purple-500/30 flex items-center px-2 text-[10px] text-white/70">Memories (actual)</div>
              <div className="h-5 rounded bg-blue-500/30 flex items-center px-2 text-[10px] text-white/70">Messages (remainder)</div>
            </div>
            <p className="text-xs text-text-muted mt-2">Non-message sections measured first, messages get whatever's left → everything fits</p>
          </div>
        </div>
      </div>

      {/* RAG for History */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
        <h2 className="text-base font-semibold text-text-primary mb-3">RAG for Message History</h2>
        <p className="text-sm text-text-muted mb-4">
          When messages get trimmed to fit the context window, relevant older messages aren't lost — they're retrieved via vector search.
        </p>
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="rounded-lg border border-border-default bg-bg-raised px-4 py-2 text-sm text-text-primary">
            Your message
          </div>
          <ArrowDown size="small" />
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2 text-sm text-text-primary">
            generateEmbedding() → vec_messages MATCH
          </div>
          <ArrowDown size="small" />
          <div className="rounded-lg border border-border-default bg-bg-raised px-4 py-2 text-sm text-text-primary">
            Top 10 relevant past messages → [RELEVANT PAST]
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Messages are embedded when sent (via <code className="text-accent">generate_embeddings</code> job). The <code className="text-accent">vec_messages</code> sqlite-vec table stores 1024-dimension vectors, queried by cosine distance on every generation.
        </p>
      </div>

      {/* Key Concepts */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
        <h2 className="text-base font-semibold text-text-primary mb-3">Key Concepts</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { title: "Context Window", desc: "The model's working memory, set per-model in Server Settings. Determines how many tokens the AI can 'see' at once." },
            { title: "Dynamic Budget", desc: "Non-message sections (lore, memories, relationships) are measured first. Messages automatically shrink to fit whatever space remains." },
            { title: "Token Estimation", desc: "Token counts use a chars/4 approximation. Actual tokenization may vary by model. The budget bar is an estimate, not a precise count." },
            { title: "Message Limit", desc: "Configurable cap on how many recent messages are fetched from the database. Default 30, adjustable in Server Settings." },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-lg border border-border-default bg-bg-raised p-4">
              <p className="text-sm font-medium text-text-primary mb-1">{title}</p>
              <p className="text-xs text-text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArrowDown({ size = "normal" }: { size?: "normal" | "small" }) {
  const cls = size === "small" ? "h-4 w-4" : "h-5 w-5";
  return (
    <svg className={`${cls} text-text-muted`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}

const sectionColors: Record<string, string> = {
  overhead: "#6b7280",
  messages: "#3b82f6",
  lore: "#22c55e",
  memories: "#a855f7",
  relationships: "#f97316",
  threads: "#eab308",
};

function sectionColor(key: string): string {
  return sectionColors[key] || "#6b7280";
}
