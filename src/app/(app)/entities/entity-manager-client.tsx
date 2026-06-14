"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  User, Ghost, MapPin, Calendar, Flag, Package, Plus, Search, Loader2, ExternalLink, BookOpen, Merge, X, Globe, Trash2
} from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { Modal } from "@/components/ui/modal";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

interface Entity {
  id: string;
  entityType: string;
  displayName: string;
  description: string | null;
  aliases: string[];
  universeId: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_META: Record<string, { icon: typeof User; color: string; bgColor: string; label: string }> = {
  persona: { icon: User, color: "text-blue-400", bgColor: "bg-blue-500/10", label: "Persona" },
  npc: { icon: Ghost, color: "text-purple-400", bgColor: "bg-purple-500/10", label: "NPC" },
  location: { icon: MapPin, color: "text-green-400", bgColor: "bg-green-500/10", label: "Location" },
  event: { icon: Calendar, color: "text-amber-400", bgColor: "bg-amber-500/10", label: "Event" },
  faction: { icon: Flag, color: "text-rose-400", bgColor: "bg-rose-500/10", label: "Faction" },
  item: { icon: Package, color: "text-orange-400", bgColor: "bg-orange-500/10", label: "Item" },
};

type FilterType = "all" | "persona" | "npc" | "location" | "event" | "faction" | "item";

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "persona", label: "Personas" },
  { key: "npc", label: "NPCs" },
  { key: "location", label: "Locations" },
  { key: "event", label: "Events" },
  { key: "faction", label: "Factions" },
  { key: "item", label: "Items" },
];

const ENTITY_FOLDER: Record<string, string> = {
  persona: "entities/characters",
  npc: "entities/characters",
  location: "entities/locations",
  event: "entities/events",
  faction: "entities/factions",
  item: "entities/items",
};

export function EntityManagerClient() {
  const router = useRouter();
  const { activeUniverse } = useApp();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [wikiMap, setWikiMap] = useState<Record<string, string>>({});
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSource, setMergeSource] = useState<Entity | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{
    sourceId: string; sourceName: string; sourceType: string;
    targetId: string; targetName: string; targetType: string; score: number;
  }> | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState("persona");
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Entity | null>(null);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      const res = await fetch(`/api/entities${params.toString() ? "?" + params.toString() : ""}`);
      if (res.ok) {
        const json = await res.json();
        setEntities(json.entities || []);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [filterType, searchQuery, activeUniverse]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  // Load wiki page map for "Edit in Wiki" links
  useEffect(() => {
    fetch("/api/wiki")
      .then(r => r.json())
      .then(json => {
        const pages = json.pages || [];
        const map: Record<string, string> = {};
        for (const page of pages) {
          if (page.frontmatter?.entity_id) {
            map[page.frontmatter.entity_id] = page.path.replace(/\.md$/, "");
          }
        }
        setWikiMap(map);
      })
      .catch(() => {});
  }, []);

  function openCreateDialog(type: string) {
    setCreateType(type);
    setCreateName("");
    setShowCreateModal(true);
  }

  async function handleCreateEntity() {
    const name = createName.trim();
    if (!name) return;

    setCreateLoading(true);
    try {
      // Create entity registry entry
      const regRes = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: createType,
          displayName: name,
          universeId: activeUniverse?.id || undefined,
        }),
      });
      if (!regRes.ok) {
        alert("Failed to create entity");
        setCreateLoading(false);
        return;
      }
      const regJson = await regRes.json();
      const entityId = regJson.entity.id;
      const folder = ENTITY_FOLDER[createType] || "entities";

      // Create wiki page
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const pagePath = `${folder}/${slug}.md`;
      const wikiRes = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pagePath,
          content: `# ${name}\n`,
          universeId: activeUniverse?.id,
          frontmatter: {
            title: name,
            type: "entity",
            subtype: createType,
            status: "draft",
            universe: activeUniverse?.id || undefined,
            entity_id: entityId,
            tags: [createType],
          },
        }),
      });
      if (wikiRes.ok) {
        const wikiJson = await wikiRes.json();
        const wikiPath = wikiJson.path.replace(/\.md$/, "");
        router.push(`/wiki/${wikiPath}`);
      }
      await loadEntities();
    } catch {
      alert("Failed to create entity");
    } finally {
      setCreateLoading(false);
      setShowCreateModal(false);
    }
  }

  const filtered = searchQuery.trim()
    ? entities.filter(e => e.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    : entities;

  return (
    <>
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Entities</h1>
          {activeUniverse && (
            <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
              <Globe className="h-3 w-3" />
              {activeUniverse.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openCreateDialog("persona")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <Plus size={14} /> Persona
          </button>
          <button
            onClick={() => openCreateDialog("npc")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-text-primary text-sm font-medium hover:bg-bg-raised transition-colors"
          >
            <Plus size={14} /> NPC
          </button>
          <button
            onClick={() => openCreateDialog("location")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-text-primary text-sm font-medium hover:bg-bg-raised transition-colors"
          >
            <Plus size={14} /> Location
          </button>
          <button
            onClick={() => openCreateDialog("event")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-text-primary text-sm font-medium hover:bg-bg-raised transition-colors"
          >
            <Plus size={14} /> Event
          </button>
          <button
            onClick={() => openCreateDialog("faction")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-text-primary text-sm font-medium hover:bg-bg-raised transition-colors"
          >
            <Plus size={14} /> Faction
          </button>
          <button
            onClick={() => openCreateDialog("item")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-text-primary text-sm font-medium hover:bg-bg-raised transition-colors"
          >
            <Plus size={14} /> Item
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filterType === tab.key
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text-primary hover:bg-bg-raised"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-48 pl-8 pr-3 py-1.5 rounded border border-border-default bg-bg-raised text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Merge mode banner */}
      {mergeMode && (
        <div className="mb-3 p-3 rounded-lg border border-accent/30 bg-accent/5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-primary">
              {mergeSource
                ? `Merging "${mergeSource.displayName}" into... click the target entity below`
                : "Click the entity you want to merge FROM"}
            </p>
            <div className="flex gap-2">
              {mergeSource && (
                <button
                  onClick={async () => {
                    setMergingId("manual");
                    const targetId = prompt("Enter target entity ID to merge into:");
                    if (targetId) {
                      try {
                        await fetch("/api/entities/merge", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ sourceId: mergeSource.id, targetId }),
                        });
                        await loadEntities();
                      } catch {}
                    }
                    setMergingId(null);
                    setMergeMode(false);
                    setMergeSource(null);
                  }}
                  disabled={mergingId === "manual"}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {mergingId === "manual" ? "Merging..." : "Merge by ID"}
                </button>
              )}
              <button
                onClick={() => { setMergeMode(false); setMergeSource(null); }}
                className="p-1 rounded text-text-muted hover:text-text-primary"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge suggestions */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => { setMergeMode(true); setMergeSource(null); }}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border border-border-default text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors"
        >
          <Merge size={12} /> {mergeMode ? "Select source..." : "Merge Entities"}
        </button>
        <button
          onClick={async () => {
            setSuggestLoading(true);
            try {
              const res = await fetch("/api/entities/merge-suggestions");
              const json = await res.json();
              setSuggestions(json.suggestions || []);
            } catch {
              setSuggestions([]);
            } finally {
              setSuggestLoading(false);
            }
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border border-border-default text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors"
        >
          <Merge size={12} /> {suggestLoading ? "Scanning..." : "Suggest Merges"}
        </button>
        {suggestions && suggestions.length > 0 && (
          <span className="text-xs text-text-muted">{suggestions.length} potential duplicate(s) found</span>
        )}
        {suggestions && suggestions.length === 0 && (
          <span className="text-xs text-text-muted">No duplicates found</span>
        )}
        {suggestions !== null && (
          <button
            onClick={() => setSuggestions(null)}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Clear
          </button>
        )}
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="mb-4 space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <div className="flex-1 text-sm">
                <span className="text-text-primary font-medium">{s.sourceName}</span>
                <span className="text-text-muted mx-1">({s.sourceType})</span>
                <span className="text-text-muted">→</span>
                <span className="text-text-primary font-medium ml-1">{s.targetName}</span>
                <span className="text-text-muted mx-1">({s.targetType})</span>
                <span className="text-xxs text-text-muted ml-2">match: {s.score}</span>
              </div>
              <button
                onClick={async () => {
                  setMergingId(s.sourceId);
                  try {
                    await fetch("/api/entities/merge", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ sourceId: s.sourceId, targetId: s.targetId }),
                    });
                    setSuggestions(prev => prev ? prev.filter((_, idx) => idx !== i) : null);
                  } finally {
                    setMergingId(null);
                  }
                }}
                disabled={mergingId === s.sourceId}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {mergingId === s.sourceId ? "Merging..." : "Merge"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      )}

      {/* Entity list */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="h-8 w-8 mx-auto text-text-muted mb-2" />
          <p className="text-text-muted">
            {searchQuery ? "No matching entities" : "No entities yet"}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(entity => {
            const meta = TYPE_META[entity.entityType] || TYPE_META.persona;
            const Icon = meta.icon;
            const wikiPath = wikiMap[entity.id];
            return (
              <div
                key={entity.id}
                className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                  mergeSource?.id === entity.id
                    ? "border-accent bg-accent/5"
                    : mergeMode
                    ? "border-amber-500/30 bg-amber-500/5 cursor-pointer hover:border-accent/30"
                    : "border-border-default bg-bg-elevated hover:border-accent/30"
                }`}
                onClick={mergeMode && !mergeSource ? () => setMergeSource(entity) : undefined}
              >
                {/* Type icon */}
                <div className={`p-2 rounded-md ${meta.bgColor} shrink-0`}>
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {entity.displayName}
                    </span>
                    <span className={`text-xxs px-1.5 py-0.5 rounded ${meta.bgColor} ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  {entity.description && (
                    <p className="text-xs text-text-muted mt-1 line-clamp-2">
                      {entity.description}
                    </p>
                  )}
                  {entity.aliases.length > 0 && (
                    <p className="text-xxs text-text-muted mt-1">
                      Aliases: {entity.aliases.join(", ")}
                    </p>
                  )}
                  <p className="text-xxs text-text-muted mt-0.5 font-mono">
                    {entity.id}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {mergeMode ? (
                    mergeSource ? (
                      <button
                        onClick={async () => {
                          if (!mergeSource) return;
                          setMergingId(entity.id);
                          try {
                            await fetch("/api/entities/merge", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ sourceId: mergeSource.id, targetId: entity.id }),
                            });
                            setMergeMode(false);
                            setMergeSource(null);
                            await loadEntities();
                          } finally {
                            setMergingId(null);
                          }
                        }}
                        disabled={entity.id === mergeSource.id || mergingId === entity.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                      >
                        {mergingId === entity.id ? "Merging..." : `Merge into "${entity.displayName}"`}
                      </button>
                    ) : (
                      <button
                        onClick={() => setMergeSource(entity)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-accent text-accent hover:bg-accent/10 transition-colors"
                      >
                        Merge FROM
                      </button>
                    )
                  ) : wikiPath ? (
                    <button
                      onClick={() => router.push(`/wiki/${wikiPath}`)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
                    >
                      <ExternalLink size={12} /> Edit in Wiki
                    </button>
                  ) : (
                    <span className="text-xxs text-text-muted">No wiki page</span>
                  )}
                  {!mergeMode && (
                    <button
                      onClick={() => setDeleteTarget(entity)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-error hover:bg-error/10 transition-colors"
                      title={`Delete ${entity.displayName}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

      {/* Delete confirmation */}
      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await fetch(`/api/entities/${deleteTarget.id}`, { method: "DELETE" });
          await loadEntities();
        }}
        title={`Delete ${deleteTarget?.displayName || "Entity"}`}
        message={`Are you sure you want to delete "${deleteTarget?.displayName}"? This will also remove the associated wiki page. This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      {/* Create entity modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={`Create ${createType.charAt(0).toUpperCase() + createType.slice(1)}`}
        size="sm"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); handleCreateEntity(); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={`Enter ${createType} name...`}
              autoFocus
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent transition-colors"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!createName.trim() || createLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {createLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Create
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
