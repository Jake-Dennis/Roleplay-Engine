/**
 * ValidationQueue Component
 *
 * Shows lore entries awaiting review, embeddable in the lore page
 * as a tab or sidebar section.
 *
 * Features:
 * - List of generated_unverified and under_review entries
 * - Each entry shows: title, type, generated content preview, contradiction flags
 * - Actions: Validate → validated, Reject → rejected
 * - Filter by type (location, npc, event)
 * - Sort by importance score
 * - Bulk validate/reject
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Check, X, Filter, AlertTriangle, Clock, Sparkles } from "lucide-react";
import { useActiveUniverse } from "@/contexts/active-universe";

interface ValidationEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  state: string;
  validation_notes: string | null;
  generated_by: string | null;
  created_at: string;
  contradiction_flags: string | null;
}

interface ValidationQueueProps {
  compact?: boolean;
  onValidate?: (id: string, state: "validated" | "rejected") => void;
}

export function ValidationQueue({ compact = false, onValidate }: ValidationQueueProps) {
  const { activeUniverse } = useActiveUniverse();
  const [entries, setEntries] = useState<ValidationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("state", filter);
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      const res = await fetch(`/api/lore-validations?${params}`);
      const data = await res.json();
      let validations = data.validations || [];

      // Filter by entity type
      if (typeFilter !== "all") {
        validations = validations.filter((v: ValidationEntry) => v.entity_type === typeFilter);
      }

      setEntries(validations);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeUniverse?.id, filter, typeFilter]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleValidate(id: string, state: "validated" | "rejected") {
    setProcessing(id);
    try {
      const entry = entries.find((v) => v.id === id);
      await fetch("/api/lore-validations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: entry?.entity_type,
          entityId: entry?.entity_id,
          state,
          validationNotes: `User ${state} on ${new Date().toLocaleString()}`,
        }),
      });
      onValidate?.(id, state);
      await loadEntries();
    } finally {
      setProcessing(null);
    }
  }

  async function handleBulkValidate(state: "validated" | "rejected") {
    if (selected.size === 0) return;
    for (const id of selected) {
      await handleValidate(id, state);
    }
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getStateBadge(state: string) {
    switch (state) {
      case "validated":
        return <span className="rounded-full bg-success/10 px-2 py-0.5 text-xxs text-success">Validated</span>;
      case "rejected":
        return <span className="rounded-full bg-error/10 px-2 py-0.5 text-xxs text-error">Rejected</span>;
      case "under_review":
        return <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xxs text-warning flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />Under Review</span>;
      default:
        return <span className="rounded-full bg-text-muted/10 px-2 py-0.5 text-xxs text-text-muted flex items-center gap-1"><Clock className="h-2.5 w-2.5" />Unverified</span>;
    }
  }

  function getContradictionBadges(notes: string | null) {
    if (!notes) return null;

    // Parse semantic contradiction markers: [type/severity] explanation
    const matches = [...notes.matchAll(/\[(\w+)\/(\w+)\]/g)];
    if (matches.length === 0) return null;

    return matches.map((m, i) => {
      const type = m[1];
      const severity = m[2];
      const color = severity === "high" ? "bg-error/10 text-error" : severity === "medium" ? "bg-warning/10 text-warning" : "bg-text-muted/10 text-text-muted";
      return (
        <span key={i} className={`rounded-full px-1.5 py-0.5 text-xxs flex items-center gap-0.5 ${color}`}>
          <AlertTriangle className="h-2.5 w-2.5" /> {type} ({severity})
        </span>
      );
    });
  }

  function getEntityTypeIcon(type: string) {
    switch (type) {
      case "location": return "📍";
      case "npc": return "👤";
      case "event": return "📅";
      case "lore": return "📖";
      default: return "📄";
    }
  }

  const pendingCount = entries.filter((e) => e.state === "generated_unverified" || e.state === "under_review").length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-6 text-text-muted">
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading validations...</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-text-muted" />
        <h3 className="mt-2 text-sm font-medium text-text-primary">No validations</h3>
        <p className="mt-1 text-xs text-text-muted">
          AI-generated lore will appear here for review
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-text-accent" />
          <h3 className="text-sm font-medium text-text-primary">
            Validation Queue
            {pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-xxs text-text-accent">
                {pendingCount} pending
              </span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3 w-3 text-text-muted" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-border-default bg-bg-raised px-2 py-1 text-xxs text-text-primary"
          >
            <option value="all">All states</option>
            <option value="generated_unverified">Unverified</option>
            <option value="under_review">Under Review</option>
            <option value="validated">Validated</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-border-default bg-bg-raised px-2 py-1 text-xxs text-text-primary"
          >
            <option value="all">All types</option>
            <option value="location">Locations</option>
            <option value="npc">NPCs</option>
            <option value="event">Events</option>
            <option value="lore">Lore</option>
          </select>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-bg-raised px-3 py-2">
          <span className="text-xxs text-text-muted">{selected.size} selected</span>
          <button
            onClick={() => handleBulkValidate("validated")}
            className="flex items-center gap-1 rounded bg-success/10 px-2 py-1 text-xxs font-medium text-success hover:bg-success/20"
          >
            <Check className="h-3 w-3" /> Validate All
          </button>
          <button
            onClick={() => handleBulkValidate("rejected")}
            className="flex items-center gap-1 rounded bg-error/10 px-2 py-1 text-xxs font-medium text-error hover:bg-error/20"
          >
            <X className="h-3 w-3" /> Reject All
          </button>
        </div>
      )}

      {/* Entries */}
      <div className="space-y-2">
        {entries.map((entry) => {
          const isPending = entry.state === "generated_unverified" || entry.state === "under_review";
          const isExpanded = expandedId === entry.id;
          const hasContradictions = entry.contradiction_flags && entry.contradiction_flags !== "[]";

          return (
            <div
              key={entry.id}
              className={`rounded-lg border border-border-default bg-bg-elevated transition-colors ${
                selected.has(entry.id) ? "border-accent/30 bg-accent/5" : ""
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                {/* Checkbox for bulk selection */}
                {isPending && (
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="h-3.5 w-3.5 rounded border-border-default accent-accent"
                  />
                )}

                {/* Entity type icon */}
                <span className="text-sm">{getEntityTypeIcon(entry.entity_type)}</span>

                {/* Entity info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {entry.entity_name || `${entry.entity_type}: ${entry.entity_id}`}
                    </p>
                    {getStateBadge(entry.state)}
                    {hasContradictions && (
                      <span className="rounded-full bg-error/10 px-1.5 py-0.5 text-xxs text-error flex items-center gap-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" /> Contradiction
                      </span>
                    )}
                    {getContradictionBadges(entry.validation_notes)}
                  </div>
                  <p className="text-xxs text-text-muted mt-0.5">
                    {entry.generated_by && `Generated by ${entry.generated_by} · `}
                    {new Date(entry.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                {isPending && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleValidate(entry.id, "validated")}
                      disabled={processing === entry.id}
                      className="flex items-center gap-1 rounded bg-success/10 px-2 py-1 text-xxs font-medium text-success hover:bg-success/20 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleValidate(entry.id, "rejected")}
                      disabled={processing === entry.id}
                      className="flex items-center gap-1 rounded bg-error/10 px-2 py-1 text-xxs font-medium text-error hover:bg-error/20 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {!compact && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
                        title="View details"
                      >
                        <span className="text-xxs">{isExpanded ? "▲" : "▼"}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && entry.validation_notes && (
                <div className="border-t border-border-default px-3 py-2">
                  {hasContradictions ? (
                    <div className="space-y-1">
                      <p className="text-xxs font-medium text-error flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Semantic Contradictions Detected
                      </p>
                      {entry.validation_notes.split("\n").filter((l) => l.trim()).map((line, i) => (
                        <p key={i} className="text-xxs text-text-muted pl-4">• {line}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xxs text-text-muted">{entry.validation_notes}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
