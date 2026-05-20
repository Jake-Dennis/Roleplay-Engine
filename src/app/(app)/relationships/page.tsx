"use client";

import { useEffect, useState, useCallback } from "react";
import { Heart, Sparkles, Trash2, Plus, ChevronDown, ChevronUp, TrendingUp, Network, FileEdit } from "lucide-react";
import { DecayIndicator } from "@/components/relationships/decay-indicator";
import { RelationshipWeb } from "@/components/relationships/relationship-web";
import { EmotionGraph } from "@/components/relationships/emotion-graph";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmotionBar } from "@/components/relationship/emotion-bar";
import { RelationshipHistory } from "@/components/relationship/relationship-history";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";
import { safeParse } from "@/lib/safe-json";
import type { EmotionalState } from "@/lib/relationship-types";

interface Relationship {
  id: string;
  source_entity: string;
  target_entity: string;
  emotional_state: string | null;
  relationship_stage: string;
  updated_at: string;
}

interface EvolutionEntry {
  id: string;
  emotional_state: EmotionalState;
  relationship_stage: string | null;
  trigger_event: string | null;
  recorded_at: string;
}

export default function RelationshipsPage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [sourceEntity, setSourceEntity] = useState("");
  const [targetEntity, setTargetEntity] = useState("");
  const [relationshipStage, setRelationshipStage] = useState("acquaintance");
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evolutionHistory, setEvolutionHistory] = useState<Record<string, EvolutionEntry[]>>({});
  const [loadingEvolution, setLoadingEvolution] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "viz">("list");
  const [selectedRel, setSelectedRel] = useState<Relationship | null>(null);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState("");
  const [markdownNotes, setMarkdownNotes] = useState("");
  const [savingMarkdown, setSavingMarkdown] = useState(false);
  const [markdownLoaded, setMarkdownLoaded] = useState(false);

  async function loadRelationships() {
    try {
      const params = new URLSearchParams();
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const res = await fetch(`/api/relationships${params.toString() ? "?" + params.toString() : ""}`);
      const data = await res.json();
      setRelationships(data.relationships || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRelationships(); }, [activeUniverse?.id, activeGroup?.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceEntity.trim() || !targetEntity.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: sourceEntity.trim(),
          targetEntity: targetEntity.trim(),
          relationshipStage,
          universe_id: activeUniverse?.id || null,
          group_id: activeGroup?.id || null,
        }),
      });
      setShowCreate(false);
      setSourceEntity("");
      setTargetEntity("");
      setRelationshipStage("acquaintance");
      await loadRelationships();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/relationships/${id}`, { method: "DELETE" });
    setRelationships((prev) => prev.filter((r) => r.id !== id));
    setEvolutionHistory((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDeleteTarget(null);
  }

  const loadEvolution = useCallback(async (relId: string) => {
    if (evolutionHistory[relId]) return;
    setLoadingEvolution((prev) => ({ ...prev, [relId]: true }));
    try {
      const res = await fetch(`/api/relationships/${relId}/evolution`);
      const data = await res.json();
      setEvolutionHistory((prev) => ({ ...prev, [relId]: data.history || [] }));
    } catch {
      // ignore
    } finally {
      setLoadingEvolution((prev) => ({ ...prev, [relId]: false }));
    }
  }, [evolutionHistory]);

  function toggleExpand(relId: string) {
    if (expandedId === relId) {
      setExpandedId(null);
    } else {
      setExpandedId(relId);
      loadEvolution(relId);
    }
  }

  function parseEmotions(emotionalState: string | null): EmotionalState {
    return safeParse<EmotionalState>(emotionalState, {}) as EmotionalState;
  }

  async function openMarkdownEditor(relId: string) {
    setEditingRelId(relId);
    setMarkdownLoaded(false);
    try {
      const res = await fetch(`/api/relationships/${relId}/file`);
      const data = await res.json();
      if (data.relationship) {
        // Reconstruct markdown from parsed data
        const rel = relationships.find((r) => r.id === relId);
        if (rel) {
          const emotions = parseEmotions(rel.emotional_state);
          const emotionTable = Object.entries(emotions)
            .map(([k, v]) => `| ${k} | ${v.toFixed(2)} |`)
            .join("\n");
          const history = data.history || "";
          const notes = data.relationship.notes || "";
          setMarkdownNotes(notes);
          setMarkdownContent(
            `# ${rel.source_entity} ↔ ${rel.target_entity}\n\n## Emotional State\n\n| Emotion | Value |\n|---------|-------|\n${emotionTable}\n\n## Stage\n\n**${rel.relationship_stage}**\n\n## Notes\n\n${notes}\n`
          );
        }
      }
    } catch {
      // ignore
    } finally {
      setMarkdownLoaded(true);
    }
  }

  async function saveMarkdownEditor() {
    if (!editingRelId) return;
    setSavingMarkdown(true);
    try {
      await fetch(`/api/relationships/${editingRelId}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: markdownNotes }),
      });
      setEditingRelId(null);
    } catch {
      // ignore
    } finally {
      setSavingMarkdown(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Relationships</h1>
          <p className="mt-1 text-xs text-text-muted">Interactions between characters and NPCs</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex gap-1 rounded-lg bg-bg-raised p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "list" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("viz")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "viz" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Network className="h-3 w-3" />
              Graph
            </button>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New Relationship
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4">Create Relationship</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Source Entity</label>
                <input value={sourceEntity} onChange={(e) => setSourceEntity(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary" placeholder="e.g., Player" required />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Target Entity</label>
                <input value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary" placeholder="e.g., Haleth" required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Stage</label>
              <select value={relationshipStage} onChange={(e) => setRelationshipStage(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                <option value="acquaintance">Acquaintance</option>
                <option value="friend">Friend</option>
                <option value="ally">Ally</option>
                <option value="trusted">Trusted</option>
                <option value="rival">Rival</option>
                <option value="enemy">Enemy</option>
                <option value="lover">Lover</option>
                <option value="family">Family</option>
              </select>
            </div>
            <button type="submit" disabled={creating || !sourceEntity.trim() || !targetEntity.trim()} className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {creating ? "Creating..." : "Create Relationship"}
            </button>
          </form>
        </div>
      )}

      {/* Visualization View */}
      {viewMode === "viz" && (
        <div className="space-y-4">
          <RelationshipWeb
            relationships={relationships}
            onSelectRelationship={(rel) => {
              setSelectedRel(rel);
              setViewMode("list");
              setExpandedId(rel.id);
              loadEvolution(rel.id);
            }}
          />

          {/* Selected relationship emotion graph */}
          {selectedRel && (
            <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-text-primary">
                  {selectedRel.source_entity} ↔ {selectedRel.target_entity}
                </h3>
                <button
                  onClick={() => setSelectedRel(null)}
                  className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-center">
                <EmotionGraph emotions={parseEmotions(selectedRel.emotional_state)} size={240} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading relationships...</span>
        </div>
      ) : relationships.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No relationships</h3>
          <p className="mt-1 text-xs text-text-muted">Track interactions between entities in your story</p>
        </div>
      ) : (
        <div className="space-y-2">
          {relationships.map((rel) => {
            const emotions = parseEmotions(rel.emotional_state);
            const isExpanded = expandedId === rel.id;
            const history = evolutionHistory[rel.id] || [];

            return (
              <div key={rel.id} className="rounded-xl border border-border-default bg-bg-elevated overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={() => toggleExpand(rel.id)}
                    className="flex items-center gap-4 flex-1 text-left"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                      <Heart className="h-4 w-4 text-text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {rel.source_entity} ↔ {rel.target_entity}
                      </p>
                      <div className="flex items-center gap-2 text-xxs text-text-muted mt-0.5">
                        <span className="capitalize">{rel.relationship_stage}</span>
                        <DecayIndicator updatedAt={rel.updated_at} compact />
                        {Object.entries(emotions).slice(0, 3).map(([key, val]) => (
                          <span key={key} className="rounded-full bg-bg-raised px-1.5 py-0.5">
                            {key}: {val.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openMarkdownEditor(rel.id)}
                      className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary"
                      title="Edit as Markdown"
                    >
                      <FileEdit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleExpand(rel.id)}
                      className="rounded p-1.5 text-text-muted hover:bg-bg-raised"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button onClick={() => setDeleteTarget(rel.id)} className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-error">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border-default px-4 py-4 bg-bg-raised/30">
                    {/* Decay status */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-text-accent" />
                        <h3 className="text-xs font-medium text-text-primary">Evolution History</h3>
                      </div>
                      <DecayIndicator updatedAt={rel.updated_at} />
                    </div>

                    {loadingEvolution[rel.id] ? (
                      <div className="flex items-center gap-2 text-text-muted py-4">
                        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                        <span className="text-xs">Loading history...</span>
                      </div>
                    ) : (
                      <RelationshipHistory entries={history} loading={false} />
                    )}

                    {/* Current emotion bars */}
                    {Object.keys(emotions).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border-default">
                        <h4 className="text-xs font-medium text-text-primary mb-3">Current Emotions</h4>
                        <div className="space-y-1.5">
                          {Object.entries(emotions)
                            .sort(([, a], [, b]) => b - a)
                            .map(([key, val]) => (
                              <EmotionBar key={key} label={key} value={val} />
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Markdown Editor Modal */}
      {editingRelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[80vh] rounded-xl border border-border-default bg-bg-elevated flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
              <h3 className="text-sm font-medium text-text-primary">Edit Relationship Markdown</h3>
              <button
                onClick={() => setEditingRelId(null)}
                className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!markdownLoaded ? (
                <div className="flex items-center gap-2 text-text-muted py-8 justify-center">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  <span className="text-xs">Loading...</span>
                </div>
              ) : (
                <>
                  {/* Preview */}
                  <div className="rounded-lg border border-border-default bg-bg-raised px-3 py-2">
                    <p className="text-xxs text-text-muted mb-1">Preview</p>
                    <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                      {markdownContent}
                    </pre>
                  </div>
                  {/* Notes editor */}
                  <div>
                    <label className="mb-1 block text-xs text-text-secondary">Notes</label>
                    <textarea
                      value={markdownNotes}
                      onChange={(e) => setMarkdownNotes(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary resize-y"
                      placeholder="Add notes about this relationship..."
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-default">
              <button
                onClick={() => setEditingRelId(null)}
                className="rounded-lg bg-bg-raised px-3.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={saveMarkdownEditor}
                disabled={savingMarkdown || !markdownLoaded}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <FileEdit className="h-3.5 w-3.5" />
                {savingMarkdown ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Relationship"
        message="Delete this relationship? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
