"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  MessageSquare,
  Globe,
  Users,
  Clock,
  ArrowRight,
  Sparkles,
  ChevronDown,
  BrainCircuit,
} from "lucide-react";
import { useApp } from "@/contexts/app-context";
import RecentChangesWidget from "@/components/wiki/recent-changes-widget";

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

function AIManagementPanel({ universeId }: { universeId: string | null }) {
  const [data, setData] = useState<AIMetricsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!universeId) return;
    setLoading(true);
    fetch(`/api/universe/${universeId}/ai-metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [universeId]);

  // Poll every 15s when panel is open
  useEffect(() => {
    if (!universeId) return;
    const interval = setInterval(() => {
      fetch(`/api/universe/${universeId}/ai-metrics`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setData(d));
    }, 15000);
    return () => clearInterval(interval);
  }, [universeId]);

  if (!universeId) {
    return (
      <p className="text-xs text-text-muted py-8 text-center">Select a universe to view AI metrics.</p>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Sparkles className="h-5 w-5 text-text-muted animate-pulse" />
        <span className="ml-2 text-xs text-text-muted">Loading metrics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-xs text-text-muted py-8 text-center">Failed to load AI metrics.</p>
    );
  }

  const totalTokens = data.model.contextWindow;
  const { context, model, stats } = data;
  const sections = context.sections;
  const usedPct = totalTokens > 0 ? ((context.totalPrompt / totalTokens) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
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

export default function DashboardPage() {
  const router = useRouter();
  const { activeGroup, activeUniverse, universes } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string | null>(null);
  const [showAiManagement, setShowAiManagement] = useState(false);

  useEffect(() => {
    const url = activeGroup ? `/api/sessions?group_id=${activeGroup.id}` : "/api/sessions?scope=personal";
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeGroup]);

  // Default universe filter to active universe, then first universe
  useEffect(() => {
    if (activeUniverse) {
      setSelectedUniverseId(activeUniverse.id);
    } else if (universes.length > 0) {
      setSelectedUniverseId(universes[0].id);
    }
  }, [activeUniverse, universes]);

  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-xs text-text-muted">Overview of your roleplaying worlds</p>
        </div>
        <Link
          href="/session/new"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Session
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2.5 text-text-muted">
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs">Sessions</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">
            {loading ? "..." : sessions.length}
          </p>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2.5 text-text-muted">
            <Globe className="h-4 w-4" />
            <span className="text-xs">Universes</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">{universes.length}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2.5 text-text-muted">
            <Users className="h-4 w-4" />
            <span className="text-xs">Characters</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">&mdash;</p>
        </div>
      </div>

      {/* AI Management Section */}
      <div className="rounded-xl border border-border-default bg-bg-elevated overflow-hidden">
        <button
          onClick={() => setShowAiManagement(!showAiManagement)}
          className="flex w-full items-center justify-between px-5 py-3.5 transition-colors hover:bg-bg-raised"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
              <BrainCircuit className="h-4 w-4 text-accent" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">AI Management</p>
              <p className="text-xxs text-text-muted">Context budget, model info, and universe stats</p>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-text-muted transition-transform ${showAiManagement ? "rotate-180" : ""}`}
          />
        </button>

        {showAiManagement && (
          <div className="border-t border-border-default px-5 py-4 space-y-4">
            {/* Universe filter */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-text-muted whitespace-nowrap">Universe:</label>
              <select
                value={selectedUniverseId ?? ""}
                onChange={(e) => setSelectedUniverseId(e.target.value || null)}
                className="flex-1 max-w-xs rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                {universes.length === 0 && <option value="">No universes available</option>}
                {universes.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <AIManagementPanel universeId={selectedUniverseId} />
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">Recent Sessions</h2>
          <Link
            href="/session"
            className="text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span className="text-xs">Loading sessions...</span>
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-10 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-text-muted" />
            <h3 className="mt-3 text-sm font-medium text-text-primary">No sessions yet</h3>
            <p className="mt-1 text-xs text-text-muted">
              Create your first session to start roleplaying
            </p>
            <Link
              href="/session/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Session
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => router.push(`/session/${session.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-border-default bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-raised"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                    <MessageSquare className="h-4 w-4 text-text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {session.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xxs text-text-muted">
                      <span>{session.status}</span>
                      {session.updated_at && (
                        <>
                          <span>·</span>
                          <Clock className="h-3 w-3" />
                          <span>{new Date(session.updated_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-text-muted" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recent Wiki Changes */}
      <RecentChangesWidget />
    </div>
  );
}
