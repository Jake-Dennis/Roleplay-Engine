"use client";

import { useEffect, useState } from "react";
import { Sparkles, BrainCircuit, BookOpen } from "lucide-react";
import { useApp } from "@/contexts/app-context";

interface Session {
  id: string;
  name: string;
  universe_id: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  owner_name: string;
}

interface Universe {
  id: string;
  name: string;
}

interface AIMetricsData {
  universe: { id: string; name: string };
  model: {
    name: string;
    contextWindow: number;
    choicesModel: string | null;
    embeddingModel: string | null;
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-text-primary tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function AIManagementPanel({ sessionId }: { sessionId: string | null }) {
  const [data, setData] = useState<AIMetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiTab, setAiTab] = useState<"metrics" | "docs">("metrics");

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    
    const loadMetrics = async () => {
      try {
        // 1. Get session data to find universe_id
        const sessionRes = await fetch(`/api/sessions/${sessionId}`);
        if (!sessionRes.ok) { setLoading(false); return; }
        const sessionData = await sessionRes.json();
        if (!sessionData?.session) { setLoading(false); return; }
        
        const universeId = sessionData.session.universe_id || '';
        
        // 2. Fetch universe names
        const uniRes = await fetch(`/api/universes`);
        const uniData = uniRes.ok ? await uniRes.json() : { universes: [] };
        const universeName = (uniData.universes || []).find((u: any) => u.id === universeId)?.name || sessionData.session.name || 'Unknown';
        
        // 3. Fetch universe-level metrics
        let universeMetrics = null;
        if (universeId) {
          try {
            const metricsRes = await fetch(`/api/universe/${universeId}/ai-metrics`);
            if (metricsRes.ok) {
              universeMetrics = await metricsRes.json();
              console.log('[dashboard] Universe metrics loaded:', universeMetrics?.stats?.totalWikiPages, 'wiki pages');
            } else {
              console.warn('[dashboard] Universe metrics API returned', metricsRes.status);
            }
          } catch (e) {
            console.warn('[dashboard] Universe metrics fetch failed:', e);
          }
        }
        
        const totalTokens = universeMetrics?.model?.contextWindow || 131072;
        const msgTokens = (sessionData.messages || []).reduce((s: number, m: any) => s + Math.round((m.content?.length || 0) / 4), 0);
        
        setData({
          universe: { id: universeId, name: universeName },
          model: {
            name: universeMetrics?.model?.name || 'unknown',
            contextWindow: totalTokens,
            choicesModel: universeMetrics?.model?.choicesModel || null,
            embeddingModel: universeMetrics?.model?.embeddingModel || null,
            availableModels: universeMetrics?.model?.availableModels || [],
          },
          context: universeMetrics?.context || {
            totalPrompt: msgTokens + 500,
            freeTokens: totalTokens - msgTokens - 500,
            sections: {
              overhead: { tokens: 500, label: "System Prompt + Instructions", count: null },
              messages: { tokens: msgTokens, label: "Session Messages", count: (sessionData.messages || []).length },
              lore: { tokens: 0, label: "Known World / Lore", count: null },
              memories: { tokens: 0, label: "Narrative Memories", count: null },
              relationships: { tokens: 0, label: "Relationships", count: null },
              threads: { tokens: 0, label: "Narrative Threads", count: null },
            },
          },
          stats: universeMetrics?.stats || {
            totalMessages: (sessionData.messages || []).length,
            totalSessions: 1,
            totalWikiPages: 0,
            totalNarrativeThreads: 0,
            totalRelationships: 0,
            totalMemories: 0,
          },
        });
      } catch (e) {
        console.warn('[dashboard] loadMetrics error:', e);
      }
      setLoading(false);
    };
    
    loadMetrics();
  }, [sessionId]);

  // Poll every 15s
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      fetch(`/api/sessions/${sessionId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d || !d.session) return;
          setData(prev => prev ? {
            ...prev,
            context: {
              ...prev.context,
              totalPrompt: 500 + (d.messages || []).reduce((s: number, m: any) => s + Math.round((m.content?.length || 0) / 4), 0),
              sections: {
                ...prev.context.sections,
                messages: { ...prev.context.sections.messages, tokens: (d.messages || []).reduce((s: number, m: any) => s + Math.round((m.content?.length || 0) / 4), 0), count: (d.messages || []).length },
              },
            },
            stats: { ...prev.stats, totalMessages: (d.messages || []).length },
          } : prev);
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div>
        <TabBar aiTab={aiTab} setAiTab={setAiTab} />
        <p className="text-xs text-text-muted py-8 text-center">Select a session to view AI metrics.</p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div>
        <TabBar aiTab={aiTab} setAiTab={setAiTab} />
        <div className="flex items-center justify-center py-12">
          <Sparkles className="h-5 w-5 text-text-muted animate-pulse" />
          <span className="ml-2 text-xs text-text-muted">Loading metrics...</span>
        </div>
      </div>
    );
  }

  if (aiTab === "docs") {
    return (
      <div>
        <TabBar aiTab={aiTab} setAiTab={setAiTab} />
        <HowItWorksDocs />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <TabBar aiTab={aiTab} setAiTab={setAiTab} />
        <p className="text-xs text-text-muted py-8 text-center">Failed to load AI metrics.</p>
      </div>
    );
  }

  const totalTokens = data.model.contextWindow;
  const { context, model, stats } = data;
  const sections = context.sections;
  const usedPct = totalTokens > 0 ? ((context.totalPrompt / totalTokens) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      <TabBar aiTab={aiTab} setAiTab={setAiTab} />
      {/* Summary bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Model:</span>
          <span className="text-sm font-medium text-text-primary">{model.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Used:</span>
          <span className="text-sm tabular-nums text-text-primary">{usedPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Window:</span>
          <span className="text-sm tabular-nums text-text-primary">
            {totalTokens >= 100000 ? `${(totalTokens / 1000).toFixed(0)}K` : totalTokens.toLocaleString()} tokens
          </span>
        </div>
      </div>

      {/* Context Budget Bar */}
      <div className="h-6 w-full rounded-lg overflow-hidden flex bg-bg-raised">
        {Object.entries(sections).map(([key, section]) => {
          const pct = totalTokens > 0 ? (section.tokens / totalTokens) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={key}
              className="h-full flex items-center justify-center text-[9px] font-medium text-white/80"
              style={{ width: `${pct}%`, backgroundColor: sectionColor(key) }}
              title={`${section.label}: ${section.tokens.toLocaleString()} tokens (${pct.toFixed(1)}%)`}
            />
          );
        })}
        {context.freeTokens > 0 && (
          <div
            className="h-full"
            style={{
              width: `${(context.freeTokens / totalTokens) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(sections).filter(([, s]) => s.tokens > 0).map(([key, section]) => (
          <div key={key} className="flex items-center gap-1.5 text-xxs text-text-muted">
            <div className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: sectionColor(key) }} />
            <span>{section.label}</span>
            <span className="tabular-nums">({section.tokens.toLocaleString()})</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xxs text-text-muted">
          <div className="h-2 w-2 rounded-sm border border-border-default shrink-0" />
          <span>Free ({context.freeTokens.toLocaleString()})</span>
        </div>
      </div>

      {/* Section breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-default text-xxs text-text-muted uppercase tracking-wider">
              <th className="text-left py-1.5 pr-3 font-medium">Section</th>
              <th className="text-right py-1.5 px-3 font-medium">Tokens</th>
              <th className="text-right py-1.5 px-3 font-medium">%</th>
              <th className="text-right py-1.5 pl-3 font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(sections).map(([key, section]) => {
              const pct = totalTokens > 0 ? ((section.tokens / totalTokens) * 100).toFixed(1) : "0.0";
              return (
                <tr key={key} className="border-b border-border-default/50">
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-sm shrink-0" style={{ backgroundColor: sectionColor(key) }} />
                      <span className="text-text-primary">{section.label}</span>
                    </div>
                  </td>
                  <td className="text-right py-1.5 px-3 text-text-primary tabular-nums">{section.tokens.toLocaleString()}</td>
                  <td className="text-right py-1.5 px-3 text-text-muted tabular-nums">{pct}%</td>
                  <td className="text-right py-1.5 pl-3 text-text-muted tabular-nums">{section.count ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className="py-1.5 pr-3 text-text-primary">Total Used</td>
              <td className="text-right py-1.5 px-3 text-text-primary tabular-nums">{context.totalPrompt.toLocaleString()}</td>
              <td className="text-right py-1.5 px-3 text-text-muted tabular-nums">{usedPct}%</td>
              <td className="text-right py-1.5 pl-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Wiki Pages" value={stats.totalWikiPages} />
        <StatCard label="Sessions" value={stats.totalSessions} />
        <StatCard label="Threads" value={stats.totalNarrativeThreads} />
        <StatCard label="Relationships" value={stats.totalRelationships} />
        <StatCard label="Memories" value={stats.totalMemories} />
        <StatCard label="Messages" value={stats.totalMessages} />
      </div>
    </div>
  );
}

function TabBar({ aiTab, setAiTab }: { aiTab: "metrics" | "docs"; setAiTab: (t: "metrics" | "docs") => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border-default bg-bg-raised p-0.5 w-fit mb-4">
      <button
        onClick={() => setAiTab("metrics")}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
          aiTab === "metrics"
            ? "bg-accent text-white"
            : "text-text-muted hover:text-text-default"
        }`}
      >
        <BrainCircuit className="h-3.5 w-3.5" />
        Metrics
      </button>
      <button
        onClick={() => setAiTab("docs")}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
          aiTab === "docs"
            ? "bg-accent text-white"
            : "text-text-muted hover:text-text-default"
        }`}
      >
        <BookOpen className="h-3.5 w-3.5" />
        How It Works
      </button>
    </div>
  );
}

function HowItWorksDocs() {
  return (
    <div className="space-y-6">
      {/* Pipeline Flow */}
      <div className="rounded-lg border border-border-default bg-bg-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Pipeline Flow</h3>
        <div className="flex flex-col items-center gap-2">
          <div className="w-full max-w-md rounded-lg border border-border-default bg-bg-elevated p-2.5 text-center">
            <p className="text-xs font-medium text-text-primary">User sends message</p>
            <p className="text-xxs text-text-muted mt-0.5">Classify intent, build context</p>
          </div>
          <ArrowDownIcon />
          <div className="w-full max-w-lg rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5 text-center">
            <p className="text-xs font-medium text-text-primary">getRetrievedContext()</p>
            <p className="text-xxs text-text-muted mt-0.5">Gather lore, memories, messages, threads</p>
          </div>
          <ArrowDownIcon />
          <div className="w-full max-w-lg rounded-lg border border-green-500/30 bg-green-500/5 p-2.5 text-center">
            <p className="text-xs font-medium text-text-primary">applyContextBudget()</p>
            <p className="text-xxs text-text-muted mt-0.5">Dynamic allocation — non-message sections first</p>
          </div>
          <ArrowDownIcon />
          <div className="w-full max-w-lg rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
            <div className="space-y-1 text-xxs">
              <p className="text-xs font-medium text-text-primary text-center mb-2">assemblePrompt()</p>
              {[
                "[SYSTEM]        System instructions + personality",
                "[MEMORIES]      Important narrative memories",
                "[KNOWN WORLD]   Wiki entries (locations, NPCs, etc.)",
                "[RELATIONSHIPS] Emotional state between characters",
                "[CURRENT CONVERSATION]  Persona ↔ NPC exchanges (grouped by pair)",
                "[RELEVANT PAST] Old messages relevant to now (RAG)",
                "[RECENT HISTORY] Last N messages (auto-sized)",
              ].map((line) => (
                <div key={line} className="rounded bg-bg-elevated px-2 py-1 text-text-muted font-mono">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <ArrowDownIcon />
          <div className="w-full max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-center">
            <p className="text-xs font-medium text-text-primary">Ollama generates response</p>
            <p className="text-xxs text-text-muted mt-0.5">Fits in context window ✓</p>
          </div>
        </div>
      </div>

      {/* Dynamic Budget */}
      <div className="rounded-lg border border-border-default bg-bg-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Dynamic Context Budget</h3>
        <p className="text-xxs text-text-muted mb-3">
          Non-message sections (lore, memories, relationships, threads, RAG) always get their full content. Messages automatically shrink to fit whatever space remains.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-xxs font-medium text-red-400 uppercase tracking-wider mb-2">Before (broken)</p>
            <div className="space-y-1">
              <div className="h-4 rounded bg-blue-500/30 flex items-center px-2 text-[9px] text-white/70">Messages (100%)</div>
              <div className="h-4 rounded bg-green-500/30 flex items-center px-2 text-[9px] text-white/70">Lore (100%)</div>
              <div className="h-4 rounded bg-purple-500/30 flex items-center px-2 text-[9px] text-white/70">Memories (100%)</div>
            </div>
            <p className="text-xxs text-text-muted mt-2">Each section independently claims the full window → Ollama silently truncates the middle</p>
          </div>
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
            <p className="text-xxs font-medium text-green-400 uppercase tracking-wider mb-2">After (fixed)</p>
            <div className="space-y-1">
              <div className="h-4 rounded bg-green-500/30 flex items-center px-2 text-[9px] text-white/70">Lore + Memories + RAG (full, no cap)</div>
              <div className="h-4 rounded bg-blue-500/30 flex items-center px-2 text-[9px] text-white/70">Messages (remaining space)</div>
            </div>
            <p className="text-xxs text-text-muted mt-2">Non-message sections get their full content. Messages automatically compress. Everything fits.</p>
          </div>
        </div>
      </div>

      {/* RAG for History */}
      <div className="rounded-lg border border-border-default bg-bg-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">RAG for Message History</h3>
        <p className="text-xxs text-text-muted mb-3">
          When messages get trimmed to fit the context window, relevant older messages aren't lost — they're retrieved via vector search.
        </p>
        <div className="flex flex-col items-center gap-1.5 mb-3">
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">Your message</div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-xs text-text-primary">
            generateEmbedding() → cosine similarity search
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">
            Top 10 relevant past messages → [RELEVANT PAST]
          </div>
        </div>
        <p className="text-xxs text-text-muted">
          Messages are embedded when sent (via <code className="text-accent">generate_embeddings</code> job). Stored as JSON arrays in <code className="text-accent">embedding_vectors</code> — works with any embedding model, no hardcoded dimension.
        </p>
      </div>

      {/* Conversation Tracking */}
      <div className="rounded-lg border border-border-default bg-bg-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Conversation Tracking</h3>
        <p className="text-xxs text-text-muted mb-3">
          In group sessions, messages are automatically grouped by which persona is talking to which NPC. The AI sees focused exchanges instead of one flat history.
        </p>
        <div className="flex flex-col items-center gap-1.5 mb-3">
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">AI generates: "Elrond said..."</div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-text-primary">
            detectSpeakingAs() → stores speaking_as: "Elrond"
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">
            getConversationPairMessages() → pairs Gandalf↔Elrond
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-xs text-text-primary">
            [CURRENT CONVERSATION] in prompt → focused exchanges
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xxs text-text-muted">
          <span className="rounded bg-bg-raised px-2 py-1">Supports multiple NPCs per response (<code className="text-accent">Elrond, Aragorn</code>)</span>
          <span className="rounded bg-bg-raised px-2 py-1">Messages labeled by persona/NPC name, not generic "Player"</span>
          <span className="rounded bg-bg-raised px-2 py-1">View all pairs in <span className="text-accent">Conversations</span> sidebar page</span>
        </div>
      </div>

      {/* Entity Tracking */}
      <div className="rounded-lg border border-border-default bg-bg-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Entity Tracking</h3>
        <p className="text-xxs text-text-muted mb-3">
          Every character, location, and event has a unique typed ID (<code className="text-accent">persona:uuid</code>, <code className="text-accent">npc:uuid</code>) so there's no confusion between entities with the same name. Aliases let different names resolve to the same entity.
        </p>
        <div className="flex flex-col items-center gap-1.5 mb-3">
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">
            entity_registry: {"{"} "Strider" → npc:abc, "Aragorn" → npc:abc {"}"}
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-xs text-text-primary">
            Relationships, mentions, conversations all use entity IDs
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">
            Scene NPCs, session characters, thread entities — all linked
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-xs text-text-primary">
            AI sees entity descriptions in [CURRENT SCENE]
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xxs text-text-muted">
          <span className="rounded bg-bg-raised px-2 py-1">Persona/NPC editors show entity ID + aliases</span>
          <span className="rounded bg-bg-raised px-2 py-1">Merge duplicates via <span className="text-accent">Entities</span> sidebar page</span>
          <span className="rounded bg-bg-raised px-2 py-1">Wiki pages linked by entity_id in frontmatter</span>
        </div>
      </div>

      {/* Wiki System */}
      <div className="rounded-lg border border-border-default bg-bg-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Wiki System</h3>
        <p className="text-xxs text-text-muted mb-3">
          The wiki is a markdown-first knowledge base stored on disk. Each page is a <code className="text-accent">.md</code> file with YAML frontmatter. No database — just files.
        </p>
        <div className="flex flex-col items-center gap-1.5 mb-3">
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">
            Markdown files with YAML frontmatter
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-text-primary">
            YAML frontmatter: type, subtype, tags, entity_id, status
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary">
            Three statuses: draft → reviewed → locked
          </div>
          <ArrowDownIcon small />
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-xs text-text-primary">
            Auto-extracted from AI responses, curated by background jobs
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xxs text-text-muted">
          <span className="rounded bg-bg-raised px-2 py-1"><span className="text-accent">[[wikilinks]]</span> auto-create page relationships</span>
          <span className="rounded bg-bg-raised px-2 py-1">Pages linked to entities via <code className="text-accent">entity_id</code></span>
          <span className="rounded bg-bg-raised px-2 py-1"><span className="text-accent">[KNOWN WORLD]</span> injected into AI prompt</span>
          <span className="rounded bg-bg-raised px-2 py-1">Wikilink auto-fix on generation output</span>
        </div>
      </div>

      {/* Job System */}
      <div className="rounded-lg border border-border-default bg-bg-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Background Jobs</h3>
        <p className="text-xxs text-text-muted mb-3">
          Work is processed asynchronously through a priority job queue. Jobs are deduplicated (same type + scope within 30s) and debounced for burst-prone types.
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-text-primary mb-1.5">Priority Levels</p>
            <div className="grid grid-cols-4 gap-2 text-xxs">
              <div className="rounded border border-border-default bg-bg-raised p-2 text-center"><span className="text-error font-medium">High</span><br/>Instant: messages, embeddings</div>
              <div className="rounded border border-border-default bg-bg-raised p-2 text-center"><span className="text-warning font-medium">Medium</span><br/>Analysis: relationships, threads</div>
              <div className="rounded border border-border-default bg-bg-raised p-2 text-center"><span className="text-text-muted font-medium">Low</span><br/>Enrichment: wiki, NPC evolution</div>
              <div className="rounded border border-border-default bg-bg-raised p-2 text-center"><span className="text-text-muted/50 font-medium">Idle</span><br/>Maintenance: compression, decay</div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-text-primary mb-1.5">Idle Processing Tiers</p>
            <div className="space-y-1 text-xxs text-text-muted">
              <div className="flex items-center gap-2"><span className="w-16 text-accent font-medium">5 min</span> Entity mentions, embeddings, relationship analysis, message summarization</div>
              <div className="flex items-center gap-2"><span className="w-16 text-accent font-medium">10 min</span> Scene state extraction, lore extraction, thread analysis, wiki auto-extract</div>
              <div className="flex items-center gap-2"><span className="w-16 text-accent font-medium">15 min</span> Wiki deepen/enrich, NPC evolution, wiki curation, memory compression</div>
              <div className="flex items-center gap-2"><span className="w-16 text-accent font-medium">30 min</span> Relationship decay, archival processing, session recap, restructure suggestions</div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-text-primary mb-1.5">Job Types by Category</p>
            <div className="grid md:grid-cols-3 gap-2 text-xxs text-text-muted">
              <div className="space-y-1">
                <p className="text-xxs text-accent font-medium">Messages & Analysis</p>
                <div className="rounded border border-border-default bg-bg-raised p-2">
                  <div><span className="text-text-primary">summarize_messages</span> — Compress old messages</div>
                  <div><span className="text-text-primary">generate_embeddings</span> — Vector embeddings</div>
                  <div><span className="text-text-primary">analyze_relationships</span> — Update relationship states</div>
                  <div><span className="text-text-primary">thread_analysis</span> — Detect story threads</div>
                  <div><span className="text-text-primary">generate_choices</span> — Branching narrative options</div>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xxs text-accent font-medium">Wiki & Lore</p>
                <div className="rounded border border-border-default bg-bg-raised p-2">
                  <div><span className="text-text-primary">wiki_auto_extract</span> — Auto-create pages from responses</div>
                  <div><span className="text-text-primary">wiki_deepen_page</span> — Expand existing pages</div>
                  <div><span className="text-text-primary">wiki_enrich_entity</span> — Add details to entity pages</div>
                  <div><span className="text-text-primary">wiki_curate_page</span> — Tag, cross-link, validate</div>
                  <div><span className="text-text-primary">extract_lore_comprehensive</span> — Full lore extraction</div>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xxs text-accent font-medium">Maintenance</p>
                <div className="rounded border border-border-default bg-bg-raised p-2">
                  <div><span className="text-text-primary">npc_evolution</span> — NPC personality shifts</div>
                  <div><span className="text-text-primary">decay_relationships</span> — Emotional decay over time</div>
                  <div><span className="text-text-primary">compress_memories</span> — Archive old memories</div>
                  <div><span className="text-text-primary">archival_processing</span> — Data retention cleanup</div>
                  <div><span className="text-text-primary">update_entity_references</span> — Post-merge cleanup</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Concepts */}
      <div className="grid md:grid-cols-2 gap-3">
        {[
          { title: "Context Window", desc: "The model's working memory, set per-model in Server Settings. Determines how many tokens the AI can 'see' at once." },
          { title: "Dynamic Budget", desc: "Lore, memories, relationships, threads, and RAG always get their full content — no artificial caps. Messages automatically shrink to fit whatever space remains in the context window." },
          { title: "Conversation Tracking", desc: "AI responses are scanned for NPC names — detected NPCs stored in speaking_as. Creates separate persona↔NPC pairs for focused context in group sessions." },
          { title: "Entity Registry", desc: "All entities get typed IDs (persona:uuid, npc:uuid, location:uuid, event:uuid, faction:uuid). Aliases resolve different names to the same entity. Scene states, participants, and threads all use entity IDs." },
          { title: "RAG for History", desc: "All messages are embedded via generate_embeddings jobs. Relevant older messages are retrieved via cosine similarity and shown as [RELEVANT PAST] in the prompt." },
          { title: "Scene Context", desc: "Entity descriptions from the registry are injected into [CURRENT SCENE]. The AI sees not just NPC names but their descriptions, roles, and traits from the registry." },
        ].map(({ title, desc }) => (
          <div key={title} className="rounded-lg border border-border-default bg-bg-raised p-3">
            <p className="text-xs font-medium text-text-primary mb-1">{title}</p>
            <p className="text-xxs text-text-muted">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArrowDownIcon({ small }: { small?: boolean }) {
  const cls = small ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <svg className={`${cls} text-text-muted`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}

export default function DashboardPage() {
  const { activeSession, activeGroup } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [aiTab, setAiTab] = useState<"metrics" | "docs">("metrics");
  const [data, setData] = useState<AIMetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Load metrics for active session
  useEffect(() => {
    if (!activeSession) return;
    setLoading(true);

    const loadMetrics = async () => {
      try {
        const [sessionRes, uniRes, settingsRes, relRes, threadRes] = await Promise.all([
          fetch(`/api/sessions/${activeSession.id}`),
          fetch(`/api/universes`),
          fetch(`/api/settings`),
          fetch(`/api/relationships`),
          fetch(`/api/narrative-threads`),
        ]);

        const sessionData = sessionRes.ok ? await sessionRes.json() : null;
        if (!sessionData?.session) { setLoading(false); return; }

        const uniData = uniRes.ok ? await uniRes.json() : { universes: [] };
        const settingsData = settingsRes.ok ? await settingsRes.json() : {};
        const relData = relRes.ok ? await relRes.json() : { relationships: [] };
        const threadData = threadRes.ok ? await threadRes.json() : { threads: [] };

        const universeId = sessionData.session.universe_id || '';
        const universe = (uniData.universes || []).find((u: any) => u.id === universeId);
        const universeName = universe?.name || sessionData.session.name || 'Unknown';

        const model = settingsData?.ollama?.model || 'unknown';
        const contextWindow = settingsData?.modelDefaults?.[model]?.numCtx || 131072;
        const choicesModel = settingsData?.ollama?.choicesModel || null;
        const embeddingModel = settingsData?.ollama?.embeddingModel || null;

        const msgTokens = (sessionData.messages || []).reduce((s: number, m: any) => s + Math.round((m.content?.length || 0) / 4), 0);
        const msgCount = (sessionData.messages || []).length;
        const relCount = (relData.relationships || []).length;
        const threadCount = (threadData.threads || []).length;

        setData({
          universe: { id: universeId, name: universeName },
          model: { name: model, contextWindow, choicesModel, embeddingModel, availableModels: [] },
          context: {
            totalPrompt: msgTokens + 500,
            freeTokens: contextWindow - msgTokens - 500,
            sections: {
              overhead: { tokens: 500, label: "System Prompt + Instructions", count: null },
              messages: { tokens: msgTokens, label: "Session Messages", count: msgCount },
              lore: { tokens: 0, label: "Known World / Lore", count: null },
              memories: { tokens: 0, label: "Narrative Memories", count: null },
              relationships: { tokens: 0, label: "Relationships", count: null },
              threads: { tokens: 0, label: "Narrative Threads", count: null },
            },
          },
          stats: {
            totalMessages: msgCount,
            totalSessions: 1,
            totalWikiPages: 0,
            totalNarrativeThreads: threadCount,
            totalRelationships: relCount,
            totalMemories: 0,
          },
        });
      } catch {}
      setLoading(false);
    };

    loadMetrics();
  }, [activeSession]);

  const data_sections = data?.context?.sections || {};
  const totalTokens = data?.model?.contextWindow || 131072;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
            <Sparkles className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary">Dashboard</h1>
            <p className="text-xs text-text-muted">{data?.universe?.name || 'Loading...'}</p>
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-0.5 rounded-lg border border-border-default bg-bg-raised p-0.5">
          <button onClick={() => setAiTab("metrics")} className={`px-2.5 py-1 text-xxs rounded-md transition-colors ${aiTab === "metrics" ? "bg-accent text-white" : "text-text-muted hover:text-text-default"}`}>Metrics</button>
          <button onClick={() => setAiTab("docs")} className={`px-2.5 py-1 text-xxs rounded-md transition-colors ${aiTab === "docs" ? "bg-accent text-white" : "text-text-muted hover:text-text-default"}`}>How It Works</button>
        </div>
      </div>

      {aiTab === "metrics" ? (
        <>
          {/* Model + Stats bar */}
          <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xxs text-text-muted">Model</p>
                  <p className="text-sm font-medium text-text-primary">{data?.model?.name || '...'}</p>
                </div>
                <div className="w-px h-8 bg-border-default" />
                <div>
                  <p className="text-xxs text-text-muted">Context Window</p>
                  <p className="text-sm font-medium text-text-primary tabular-nums">{totalTokens >= 100000 ? `${(totalTokens / 1000).toFixed(0)}K` : totalTokens.toLocaleString()} tokens</p>
                </div>
                <div className="w-px h-8 bg-border-default" />
                <div>
                  <p className="text-xxs text-text-muted">Session</p>
                  <p className="text-sm font-medium text-text-primary">{activeSession?.name || '...'}</p>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-text-muted">
                <span>{data?.stats?.totalMessages || 0} msgs</span>
                <span>{data?.stats?.totalWikiPages || 0} wiki pages</span>
                <span>{data?.stats?.totalRelationships || 0} relationships</span>
                <span>{data?.stats?.totalNarrativeThreads || 0} threads</span>
              </div>
            </div>
            {/* Budget bar */}
            <div className="mt-3 h-5 w-full rounded-lg overflow-hidden flex bg-bg-raised">
              {Object.entries(data_sections).filter(([, s]) => s.tokens > 0).map(([key, section]) => {
                const pct = totalTokens > 0 ? (section.tokens / totalTokens) * 100 : 0;
                if (pct < 1) return null;
                return <div key={key} className="h-full" style={{ width: `${pct}%`, backgroundColor: sectionColor(key) }} title={`${section.label}: ${section.tokens.toLocaleString()} tokens`} />;
              })}
              {data && totalTokens > (data.context.totalPrompt) && (
                <div className="h-full" style={{ width: `${((totalTokens - data.context.totalPrompt) / totalTokens) * 100}%` }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
              {Object.entries(data_sections).filter(([, s]) => s.tokens > 0).map(([key, section]) => (
                <div key={key} className="flex items-center gap-1 text-xxs text-text-muted">
                  <div className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: sectionColor(key) }} />
                  <span>{section.label} ({section.tokens.toLocaleString()})</span>
                </div>
              ))}
              <div className="flex items-center gap-1 text-xxs text-text-muted">
                <div className="h-2 w-2 rounded-sm border border-border-default shrink-0" />
                <span>Free ({Math.max(0, totalTokens - (data?.context.totalPrompt || 0)).toLocaleString()})</span>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <StatCard label="Wiki Pages" value={data?.stats?.totalWikiPages || 0} />
            <StatCard label="Sessions" value={data?.stats?.totalSessions || 0} />
            <StatCard label="Messages" value={data?.stats?.totalMessages || 0} />
            <StatCard label="Relationships" value={data?.stats?.totalRelationships || 0} />
            <StatCard label="Threads" value={data?.stats?.totalNarrativeThreads || 0} />
            <StatCard label="Memories" value={data?.stats?.totalMemories || 0} />
          </div>

          {/* Recent Wiki Changes */}
                  </>
      ) : (
        <HowItWorksDocs />
      )}
    </div>
  );
}

