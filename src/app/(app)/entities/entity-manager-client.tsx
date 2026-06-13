"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Ghost,
  MapPin,
  Calendar,
  Flag,
  Plus,
  Link2,
  Copy,
  Check,
  Trash2,
  Search,
  X,
  Sparkles,
  AlertTriangle,
  Loader2,
  Pencil,
  FileText,
  ExternalLink,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Entity {
  id: string;
  entityType: string;
  displayName: string;
  description: string | null;
  aliases: string[];
  userId: string;
  universeId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_META: Record<string, { icon: typeof User; color: string; bgColor: string; label: string }> = {
  persona: { icon: User, color: "text-blue-400", bgColor: "bg-blue-500/10", label: "Persona" },
  npc: { icon: Ghost, color: "text-purple-400", bgColor: "bg-purple-500/10", label: "NPC" },
  location: { icon: MapPin, color: "text-green-400", bgColor: "bg-green-500/10", label: "Location" },
  event: { icon: Calendar, color: "text-amber-400", bgColor: "bg-amber-500/10", label: "Event" },
  faction: { icon: Flag, color: "text-rose-400", bgColor: "bg-rose-500/10", label: "Faction" },
};

const TYPE_ORDER = ["persona", "npc", "location", "event", "faction"] as const;

type FilterType = "all" | "persona" | "npc" | "location" | "event" | "faction";

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "persona", label: "Personas" },
  { key: "npc", label: "NPCs" },
  { key: "location", label: "Locations" },
  { key: "event", label: "Events" },
  { key: "faction", label: "Factions" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateId(id: string): string {
  const parts = id.split(":");
  if (parts.length === 2) {
    const uuid = parts[1];
    return `${parts[0]}:${uuid.slice(0, 8)}...${uuid.slice(-3)}`;
  }
  return id.length > 20 ? `${id.slice(0, 8)}...${id.slice(-3)}` : id;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityManagerClient() {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter / search
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add alias
  const [addingAliasFor, setAddingAliasFor] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Merge
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [merging, setMerging] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Description editing
  const [editingDescFor, setEditingDescFor] = useState<string | null>(null);
  const [descriptionText, setDescriptionText] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  // Wiki page tracking
  const [wikiEntityMap, setWikiEntityMap] = useState<Record<string, string>>({});
  const [creatingWiki, setCreatingWiki] = useState<string | null>(null);
  const [wikiError, setWikiError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/entities${params.toString() ? "?" + params.toString() : ""}`);
      if (!res.ok) {
        setError("Failed to load entities");
        return;
      }
      const json = await res.json();
      setEntities(json.entities || []);
    } catch {
      setError("Failed to load entities");
    } finally {
      setLoading(false);
    }
  }, [filterType, searchQuery]);

  useEffect(() => {
    queueMicrotask(() => loadEntities());
  }, [loadEntities]);

  // -----------------------------------------------------------------------
  // Wiki page existence check
  // -----------------------------------------------------------------------

  const loadWikiEntityMap = useCallback(async () => {
    try {
      const res = await fetch("/api/wiki");
      if (!res.ok) return;
      const json = await res.json();
      const pages = json.pages || [];
      const map: Record<string, string> = {};
      for (const page of pages) {
        if (page.frontmatter?.entity_id) {
          map[page.frontmatter.entity_id] = page.path.replace(/\.md$/, "");
        }
      }
      setWikiEntityMap(map);
    } catch {
      // Non-critical — wiki check is a best-effort enhancement
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadWikiEntityMap());
  }, [loadWikiEntityMap]);

  // -----------------------------------------------------------------------
  // Description save
  // -----------------------------------------------------------------------

  async function handleSaveDescription(entityId: string) {
    if (!descriptionText.trim()) return;
    setSavingDescription(true);
    try {
      const res = await fetch(`/api/entities/${entityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionText.trim() }),
      });

      if (res.ok) {
        setEntities((prev) =>
          prev.map((e) =>
            e.id === entityId ? { ...e, description: descriptionText.trim() } : e
          )
        );
        setEditingDescFor(null);
        setDescriptionText("");
      } else {
        const json = await res.json();
        setError(json.error || "Failed to save description");
      }
    } catch {
      setError("Failed to save description");
    } finally {
      setSavingDescription(false);
    }
  }

  // -----------------------------------------------------------------------
  // Wiki page creation
  // -----------------------------------------------------------------------

  async function handleCreateWiki(entity: Entity) {
    setCreatingWiki(entity.id);
    setWikiError(null);
    try {
      const slug = entity.displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const pagePath = `entities/${slug}.md`;

      const content = entity.description
        ? `# ${entity.displayName}\n\n${entity.description}\n`
        : `# ${entity.displayName}\n`;

      const frontmatter = {
        title: entity.displayName,
        type: "entity",
        status: "draft",
        entity_id: entity.id,
        tags: [entity.entityType],
        created: new Date().toISOString(),
      };

      const res = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pagePath,
          content,
          frontmatter,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const wikiPath = json.path.replace(/\.md$/, "");
        setWikiEntityMap((prev) => ({ ...prev, [entity.id]: wikiPath }));
        router.push(`/wiki/${wikiPath}`);
      } else {
        const json = await res.json();
        setWikiError(json.error || "Failed to create wiki page");
      }
    } catch {
      setWikiError("Failed to create wiki page");
    } finally {
      setCreatingWiki(null);
    }
  }

  // -----------------------------------------------------------------------
  // Filtered entities
  // -----------------------------------------------------------------------

  const groupedEntities = entities.reduce<Record<string, Entity[]>>((acc, e) => {
    const key = e.entityType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  // Ensure type order for display
  const orderedGroups = TYPE_ORDER.filter((t) => groupedEntities[t]?.length > 0);

  // -----------------------------------------------------------------------
  // Add alias
  // -----------------------------------------------------------------------

  async function handleAddAlias(entityId: string) {
    if (!newAlias.trim()) return;
    setSavingAlias(true);
    try {
      const res = await fetch(`/api/entities/${entityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliases: [newAlias.trim()] }),
      });

      if (res.ok) {
        setEntities((prev) =>
          prev.map((e) =>
            e.id === entityId ? { ...e, aliases: [...e.aliases, newAlias.trim()] } : e
          )
        );
        setNewAlias("");
        setAddingAliasFor(null);
      } else {
        const json = await res.json();
        setError(json.error || "Failed to add alias");
      }
    } catch {
      setError("Failed to add alias");
    } finally {
      setSavingAlias(false);
    }
  }

  // -----------------------------------------------------------------------
  // Copy ID
  // -----------------------------------------------------------------------

  async function handleCopyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for non-HTTPS environments
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  // -----------------------------------------------------------------------
  // Merge
  // -----------------------------------------------------------------------

  function handleMergeClick(entityId: string) {
    if (!mergeSource) {
      // First selection — this is the source
      setMergeSource(entityId);
    } else if (mergeSource === entityId) {
      // Clicking the same entity deselects
      setMergeSource(null);
    } else {
      // Second selection — this is the target
      setMergeTarget(entityId);
      setShowMergeConfirm(true);
    }
  }

  async function handleMergeConfirm() {
    if (!mergeSource || !mergeTarget) return;
    setMerging(true);
    try {
      const res = await fetch("/api/entities/merge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: mergeSource, targetId: mergeTarget }),
      });

      if (res.ok) {
        // Remove source from local state, update target (reload aliases)
        setEntities((prev) => prev.filter((e) => e.id !== mergeSource));
        await loadEntities();
      } else {
        const json = await res.json();
        setError(json.error || "Merge failed");
      }
    } catch {
      setError("Merge failed");
    } finally {
      setMerging(false);
      setShowMergeConfirm(false);
      setMergeSource(null);
      setMergeTarget(null);
      setMergeMode(false);
    }
  }

  function cancelMerge() {
    setMergeMode(false);
    setMergeSource(null);
    setMergeTarget(null);
    setShowMergeConfirm(false);
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/entities/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntities((prev) => prev.filter((e) => e.id !== id));
      } else {
        const json = await res.json();
        setError(json.error || "Failed to delete entity");
      }
    } catch {
      setError("Failed to delete entity");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  function renderEntityCard(entity: Entity) {
    const meta = TYPE_META[entity.entityType];
    const Icon = meta?.icon || User;
    const isMergeSource = mergeSource === entity.id;
    const isMergeTarget = mergeTarget === entity.id;
    const isAdding = addingAliasFor === entity.id;

    return (
      <div
        key={entity.id}
        className={`rounded-xl border bg-bg-elevated overflow-hidden transition-all ${
          isMergeSource
            ? "border-accent ring-1 ring-accent/30"
            : isMergeTarget
              ? "border-error ring-1 ring-error/30"
              : mergeMode
                ? "border-border-default cursor-pointer hover:border-accent/50"
                : "border-border-default"
        }`}
        onClick={() => {
          if (mergeMode) handleMergeClick(entity.id);
        }}
      >
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                  meta?.bgColor || "bg-bg-raised"
                }`}
              >
                <Icon className={`h-4 w-4 ${meta?.color || "text-text-muted"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {entity.displayName}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {/* Type badge */}
                  {meta && (
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xxs font-medium ${meta.bgColor} ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                  )}
                  {/* Universe */}
                  {entity.universeId && (
                    <span className="text-xxs text-text-muted truncate">
                      {entity.universeId.slice(0, 8)}...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {!mergeMode && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyId(entity.id);
                  }}
                  className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors"
                  title="Copy entity ID"
                >
                  {copiedId === entity.id ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMergeMode(true);
                    setMergeSource(entity.id);
                  }}
                  className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-accent transition-colors"
                  title="Merge this entity"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(entity.id);
                  }}
                  className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-error transition-colors"
                  title="Delete entity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Entity ID row */}
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xxs text-text-muted font-mono">{truncateId(entity.id)}</span>
          </div>

          {/* Description */}
          {editingDescFor === entity.id ? (
            <div className="mt-2 space-y-1.5">
              <textarea
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && !e.shiftKey) {
                    setEditingDescFor(null);
                    setDescriptionText("");
                  }
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    handleSaveDescription(entity.id);
                  }
                }}
                placeholder="Add a description..."
                rows={3}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none resize-none focus:border-accent"
                autoFocus
                disabled={savingDescription}
              />
              <div className="flex items-center gap-1.5 justify-end">
                <button
                  onClick={() => { setEditingDescFor(null); setDescriptionText(""); }}
                  className="rounded px-2 py-1 text-xxs text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveDescription(entity.id)}
                  disabled={savingDescription || !descriptionText.trim()}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xxs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {savingDescription ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Save
                </button>
              </div>
            </div>
          ) : entity.description ? (
            <div className="mt-2 group/desc relative">
              <p className="text-xxs text-text-secondary leading-relaxed line-clamp-3">
                {entity.description}
              </p>
              {!mergeMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDescriptionText(entity.description || "");
                    setEditingDescFor(entity.id);
                  }}
                  className="absolute -right-1 -top-1 rounded p-1 text-text-muted opacity-0 group-hover/desc:opacity-100 hover:text-text-accent transition-all"
                  title="Edit description"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            !mergeMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDescriptionText("");
                  setEditingDescFor(entity.id);
                }}
                className="mt-2 flex items-center gap-1 text-xxs text-text-muted hover:text-text-accent transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Add description
              </button>
            )
          )}

          {/* Aliases */}
          {entity.aliases.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {entity.aliases.map((alias) => (
                <span
                  key={alias}
                  className="inline-flex items-center rounded-md bg-bg-raised px-1.5 py-0.5 text-xxs text-text-secondary"
                >
                  {alias}
                </span>
              ))}
            </div>
          )}

          {/* Wiki page indicator */}
          {!mergeMode && !isAdding && (
            <div className="mt-2">
              {wikiEntityMap[entity.id] ? (
                <a
                  href={`/wiki/${wikiEntityMap[entity.id]}`}
                  onClick={(e) => { e.stopPropagation(); }}
                  className="inline-flex items-center gap-1 text-xxs text-text-accent hover:text-accent transition-colors"
                >
                  <FileText className="h-3 w-3" />
                  View Wiki Page
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateWiki(entity);
                  }}
                  disabled={creatingWiki === entity.id}
                  className="inline-flex items-center gap-1 text-xxs text-text-muted hover:text-text-accent transition-colors disabled:opacity-50"
                >
                  {creatingWiki === entity.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  {creatingWiki === entity.id ? "Creating..." : "Create Wiki Page"}
                </button>
              )}
            </div>
          )}

          {/* Add alias inline */}
          {isAdding ? (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddAlias(entity.id);
                  if (e.key === "Escape") { setAddingAliasFor(null); setNewAlias(""); }
                }}
                placeholder="New alias..."
                className="flex-1 rounded-lg border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
                autoFocus
                disabled={savingAlias}
              />
              <button
                onClick={() => handleAddAlias(entity.id)}
                disabled={savingAlias || !newAlias.trim()}
                className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xxs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {savingAlias ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Save
              </button>
              <button
                onClick={() => { setAddingAliasFor(null); setNewAlias(""); }}
                className="rounded p-1 text-text-muted hover:text-text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            !mergeMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNewAlias("");
                  setAddingAliasFor(entity.id);
                }}
                className="mt-2 flex items-center gap-1 text-xxs text-text-muted hover:text-text-accent transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add alias
              </button>
            )
          )}

          {/* Merge mode indicator */}
          {mergeMode && (
            <div className="mt-2 flex items-center gap-1.5">
              {isMergeSource ? (
                <span className="text-xxs font-medium text-text-accent">
                  Source selected — click another entity to merge into it
                </span>
              ) : mergeSource ? (
                <span className="text-xxs text-text-muted">
                  Click to merge <strong className="text-text-primary">{entities.find((e) => e.id === mergeSource)?.displayName}</strong> into this entity
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Entity Registry</h1>
            <p className="mt-1 text-xs text-text-muted">
              Manage all registered entities — personas, NPCs, locations, events, and factions
            </p>
        </div>

        {mergeMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelMerge}
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-error/10">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Wiki error banner */}
      {wikiError && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{wikiError}</span>
          <button onClick={() => setWikiError(null)} className="rounded p-0.5 hover:bg-warning/10">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg bg-bg-raised p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterType(tab.key)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filterType === tab.key
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities..."
            className="w-56 rounded-lg border border-border-default bg-bg-raised py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Merge mode banner */}
      {mergeMode && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-text-accent">
          <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {mergeSource
              ? `Select the target entity to merge "${entities.find((e) => e.id === mergeSource)?.displayName}" into`
              : "Select the source entity to merge from"}
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-12 text-text-muted justify-center">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading entities...</span>
        </div>
      ) : entities.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <User className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No entities found</h3>
          <p className="mt-1 text-xs text-text-muted">
            {searchQuery
              ? "Try a different search term"
              : "Entities appear here when they are registered in the system"}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {orderedGroups.map((typeKey) => {
            const meta = TYPE_META[typeKey];
            const Icon = meta?.icon || User;
            const groupEntities = groupedEntities[typeKey] || [];

            return (
              <div key={typeKey}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-md ${meta?.bgColor || "bg-bg-raised"}`}>
                    <Icon className={`h-3.5 w-3.5 ${meta?.color || "text-text-muted"}`} />
                  </div>
                  <h2 className="text-sm font-medium text-text-primary">{meta?.label || typeKey}</h2>
                  <span className="text-xxs text-text-muted">({groupEntities.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {groupEntities.map(renderEntityCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Merge confirmation dialog */}
      <ConfirmationDialog
        open={showMergeConfirm}
        onClose={() => {
          setShowMergeConfirm(false);
          setMergeTarget(null);
        }}
        onConfirm={handleMergeConfirm}
        title="Merge Entities"
        message={
          mergeSource && mergeTarget
            ? `Merge "${entities.find((e) => e.id === mergeSource)?.displayName}" into "${entities.find((e) => e.id === mergeTarget)?.displayName}"? All aliases and relationships will be transferred to the target entity. This cannot be undone.`
            : "Merge these entities?"
        }
        confirmLabel={merging ? "Merging..." : "Merge"}
        confirmVariant="danger"
      />

      {/* Delete confirmation dialog */}
      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Entity"
        message={
          deleteTarget
            ? `Delete "${entities.find((e) => e.id === deleteTarget)?.displayName}"? This will remove all aliases and references. This cannot be undone.`
            : "Delete this entity?"
        }
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        confirmVariant="danger"
      />
    </div>
  );
}
