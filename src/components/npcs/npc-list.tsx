"use client";

import { Users, Search, Shield } from "lucide-react";

interface Npc {
  id: string;
  entityId?: string | null;
  name: string;
  description: string | null;
  personalityTraits: string | null;
  behaviorPatterns: string | null;
  voiceId: string | null;
  isCanon: number;
  universeId: string | null;
  createdAt: string;
}

interface Universe {
  id: string;
  name: string;
}

interface NpcListProps {
  npcs: Npc[];
  universes: Universe[];
  selectedId: string | null;
  searchQuery: string;
  universeFilter: string;
  onSelect: (npc: Npc) => void;
  onSearchChange: (query: string) => void;
  onUniverseFilterChange: (universeId: string) => void;
  onCreateNew: () => void;
}

export function NpcList({
  npcs,
  universes,
  selectedId,
  searchQuery,
  universeFilter,
  onSelect,
  onSearchChange,
  onUniverseFilterChange,
  onCreateNew,
}: NpcListProps) {
  const filtered = npcs.filter((n) => {
    const matchesSearch =
      !searchQuery ||
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.description && n.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesUniverse = !universeFilter || n.universeId === universeFilter;
    return matchesSearch && matchesUniverse;
  });

  return (
    <div className="w-64 flex-shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-semibold text-text-primary">NPCs</h1>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Users className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search NPCs..."
          className="w-full rounded-lg border border-border-default bg-bg-raised pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>

      {/* Universe filter */}
      {universes.length > 0 && (
        <select
          value={universeFilter}
          onChange={(e) => onUniverseFilterChange(e.target.value)}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 text-xs text-text-primary mb-3 focus:border-accent"
        >
          <option value="">All universes</option>
          {universes.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      {/* NPC list */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">
              {npcs.length === 0 ? "No NPCs yet" : "No matches"}
            </p>
          </div>
        ) : (
          filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n)}
              className={`w-full text-left rounded-lg px-3 py-2.5 text-xs transition-colors ${
                selectedId === n.id
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-bg-elevated text-text-secondary hover:bg-bg-raised border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-bg-raised flex items-center justify-center text-text-muted flex-shrink-0">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{n.name}</span>
                    {n.isCanon === 1 && (
                      <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] text-success flex-shrink-0 flex items-center gap-0.5">
                        <Shield className="h-2.5 w-2.5" />
                        Canon
                      </span>
                    )}
                  </div>
                  {n.description && (
                    <p className="text-[10px] text-text-muted truncate">{n.description}</p>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
