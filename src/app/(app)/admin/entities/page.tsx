"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Hash,
  BookOpen,
  Clock,
  Eye,
} from "lucide-react";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/date-formatter";

interface EntityRow {
  entityName: string;
  totalFrequency: number;
  lastSeenAt: string;
  wikiPageCount: number;
}

interface EntityMention {
  id: string;
  entityName: string;
  sourceTable: string;
  sourceId: string;
  frequency: number;
  lastSeenAt: string;
  createdAt: string;
}

interface EntityDetail {
  entityName: string;
  mentions: EntityMention[];
}

const SOURCE_LABELS: Record<string, string> = {
  wiki_pages: "Wiki Page",
  sessions: "Session",
  messages: "Message",
  npcs: "NPC",
  characters: "Character",
  timeline_events: "Timeline Event",
};

function getSourceLabel(table: string): string {
  return SOURCE_LABELS[table] || table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSourceHref(table: string, id: string): string {
  switch (table) {
    case "wiki_pages":
      return `/wiki/${id}`;
    case "sessions":
      return `/session/${id}`;
    default:
      return "#";
  }
}

export default function AdminEntitiesPage() {
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadEntities = useCallback(async (s?: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (s) params.set("search", s);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      const res = await fetch(`/api/admin/entities?${params}`);
      const json = await res.json();
      if (cursor) {
        setEntities((prev) => [...prev, ...(json.entities || [])]);
      } else {
        setEntities(json.entities || []);
      }
      setNextCursor(json.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadEntities());
  }, [loadEntities]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setExpandedName(null);
    setDetailData(null);
    await loadEntities(searchInput);
  }

  async function handleRowClick(entityName: string) {
    if (expandedName === entityName) {
      setExpandedName(null);
      setDetailData(null);
      return;
    }
    setExpandedName(entityName);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/admin/entities?name=${encodeURIComponent(entityName)}`);
      const json = await res.json();
      setDetailData(json.entity || null);
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  }

  function loadMore() {
    if (nextCursor) {
      loadEntities(search, nextCursor);
    }
  }

  // Group mentions by source_table for detail view
  const groupedMentions = detailData?.mentions.reduce<Record<string, EntityMention[]>>((acc, m) => {
    if (!acc[m.sourceTable]) acc[m.sourceTable] = [];
    acc[m.sourceTable].push(m);
    return acc;
  }, {});

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-text-accent" />
            <h1 className="text-lg font-semibold text-text-primary">Entity Browser</h1>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Resolved entities with aliases, linked wiki pages, and mention frequency
          </p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search entities..."
            className="w-full rounded-lg border border-border-default bg-bg-elevated py-2 pl-9 pr-3 text-xs text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
          />
        </div>
      </form>

      {/* Table */}
      {loading && entities.length === 0 ? (
        <LoadingState message="Loading entities..." />
      ) : entities.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No entities found"
          description={search ? "Try a different search term" : "No entity mentions have been recorded yet"}
        />
      ) : (
        <div className="space-y-1">
          {/* Header row */}
          <div className="flex items-center gap-3 rounded-lg bg-bg-raised px-4 py-2 text-xxs font-medium text-text-muted">
            <div className="flex-1">Entity Name</div>
            <div className="w-20 text-right">Frequency</div>
            <div className="w-24 text-right">Wiki Pages</div>
            <div className="w-32 text-right">Last Seen</div>
            <div className="w-6" />
          </div>

          {entities.map((entity) => {
            const isExpanded = expandedName === entity.entityName;
            return (
              <div key={entity.entityName} className="rounded-lg border border-border-default bg-bg-elevated">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(entity.entityName)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleRowClick(entity.entityName);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors hover:bg-bg-highlight"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-text-primary">{entity.entityName}</span>
                  </div>
                  <div className="w-20 text-right">
                    <div className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5">
                      <Hash className="h-3 w-3 text-text-accent" />
                      <span className="text-xs font-medium text-text-accent">{entity.totalFrequency}</span>
                    </div>
                  </div>
                  <div className="w-24 text-right">
                    {entity.wikiPageCount > 0 ? (
                      <div className="inline-flex items-center gap-1 rounded-md bg-bg-raised px-2 py-0.5">
                        <BookOpen className="h-3 w-3 text-text-muted" />
                        <span className="text-xs text-text-secondary">{entity.wikiPageCount}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </div>
                  <div className="w-32 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-text-muted" />
                      <span className="text-xxs text-text-muted">{formatRelativeTime(entity.lastSeenAt)}</span>
                    </div>
                  </div>
                  <div className="w-6">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-text-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-muted" />
                    )}
                  </div>
                </div>

                {/* Expanded detail section */}
                {isExpanded && (
                  <div className="border-t border-border-default px-4 py-3">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                      </div>
                    ) : groupedMentions ? (
                      <div>
                        <h3 className="mb-2 text-xxs font-semibold text-text-muted uppercase tracking-wider">
                          Mentions across {detailData!.mentions.length} source{detailData!.mentions.length !== 1 ? "s" : ""}
                        </h3>
                        <div className="space-y-2">
                          {Object.entries(groupedMentions).map(([table, mentions]) => (
                            <div key={table} className="rounded-lg bg-bg-raised px-3 py-2">
                              <div className="mb-1.5 flex items-center gap-2">
                                <Eye className="h-3 w-3 text-text-accent" />
                                <span className="text-xxs font-medium text-text-primary">
                                  {getSourceLabel(table)}
                                </span>
                                <span className="text-xxs text-text-muted">({mentions.length})</span>
                              </div>
                              <div className="space-y-1">
                                {mentions.map((m) => {
                                  const href = getSourceHref(m.sourceTable, m.sourceId);
                                  return (
                                    <div key={m.id} className="flex items-center gap-2 text-xxs">
                                      {href !== "#" ? (
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-1 text-text-accent hover:text-accent-hover transition-colors"
                                        >
                                          <span className="font-mono">{m.sourceId.slice(0, 8)}...</span>
                                          <ExternalLink className="h-2.5 w-2.5" />
                                        </a>
                                      ) : (
                                        <span className="font-mono text-text-muted">{m.sourceId.slice(0, 8)}...</span>
                                      )}
                                      <span className="text-text-muted">·</span>
                                      <span className="text-text-muted">freq: {m.frequency}</span>
                                      <span className="text-text-muted">·</span>
                                      <span className="text-text-muted">{formatRelativeTime(m.lastSeenAt)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more */}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-highlight disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
