"use client";

/**
 * RelationshipTimeline Component
 *
 * Chronological timeline of relationship evolution — emotional state changes,
 * relationship stage transitions, and narrative anchor moments.
 * Renders as a slide-in panel with relationship filter and day-grouped entries.
 *
 * Usage:
 *   <RelationshipTimeline
 *     sessionId={sessionId}
 *     sessionUniverseId={session?.universe_id}
 *     onClose={() => setShowTimeline(false)}
 *   />
 */

import { TIME } from "@/lib/config";
import { useEffect, useState, useCallback, useMemo, memo } from "react";
import {
  Heart,
  HeartCrack,
  Anchor,
  ArrowRight,
  Clock,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { EmotionBar } from "@/components/relationship/emotion-bar";

// ── Types ───────────────────────────────────────────────────────────────────

interface TimelineRelationship {
  id: string;
  sourceEntity: string;
  targetEntity: string;
  relationshipStage: string;
}

interface EvolutionEntry {
  id: string;
  emotionalState: Record<string, number>;
  relationshipStage: string | null;
  triggerEvent: string | null;
  recordedAt: string;
}

interface TimelineEntry extends EvolutionEntry {
  previousEmotionalState?: Record<string, number>;
  stageChanged: boolean;
  isAnchor: boolean;
  dominantEmotionBefore: string | null;
  dominantEmotionAfter: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Find the dominant emotion (highest value) in a state map */
function getDominantEmotion(state: Record<string, number>): string | null {
  const entries = Object.entries(state);
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
}

/** Compute dominant emotion change direction: 'improving' | 'worsening' | 'stable' | null */
function getEmotionDirection(
  entry: TimelineEntry,
  positiveEmotions: Set<string>
): 'improving' | 'worsening' | 'stable' | null {
  if (!entry.previousEmotionalState) return null;
  const prev = entry.previousEmotionalState;
  const curr = entry.emotionalState;
  const prevDom = getDominantEmotion(prev);
  const currDom = getDominantEmotion(curr);
  if (!prevDom || !currDom) return null;
  if (prevDom === currDom) return 'stable';
  const prevIsPositive = positiveEmotions.has(prevDom);
  const currIsPositive = positiveEmotions.has(currDom);
  if (!prevIsPositive && currIsPositive) return 'improving';
  if (prevIsPositive && !currIsPositive) return 'worsening';
  return 'stable';
}

/** Positive emotions considered good for relationship health */
const POSITIVE_EMOTIONS = new Set([
  "trust", "loyalty", "attraction", "respect", "love", "joy",
]);

/** Stage change is considered an anchor milestone */
function isAnchorEntry(
  entry: EvolutionEntry,
  index: number,
  entries: EvolutionEntry[]
): boolean {
  if (index === 0) return true; // first entry is always a milestone
  return entry.relationshipStage !== null &&
    entry.relationshipStage !== entries[index - 1]?.relationshipStage;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface RelationshipTimelineProps {
  sessionId: string;
  sessionUniverseId?: string | null;
  onClose?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function RelationshipTimeline({
  sessionUniverseId,
  onClose,
}: RelationshipTimelineProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [relationships, setRelationships] = useState<TimelineRelationship[]>([]);
  const [selectedRelId, setSelectedRelId] = useState<string>("");
  const [evolutionData, setEvolutionData] = useState<EvolutionEntry[]>([]);
  const [loadingRels, setLoadingRels] = useState(true);
  const [loadingEvolution, setLoadingEvolution] = useState(false);
  const [evolutionError, setEvolutionError] = useState<string | null>(null);
  const [relsError, setRelsError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // ── Fetch relationships ─────────────────────────────────────────────────
  useEffect(() => {
    const frame = requestAnimationFrame(async () => {
      setLoadingRels(true);
      setRelsError(null);
      try {
        const params = new URLSearchParams();
        if (sessionUniverseId) params.set("universe_id", sessionUniverseId);
        const res = await fetch(`/api/relationships${params.toString() ? "?" + params.toString() : ""}`);
        if (!res.ok) throw new Error("Failed to load relationships");
        const json = await res.json();
        const list: TimelineRelationship[] = (json.relationships || []).map(
          (r: Record<string, unknown>) => ({
            id: r.id as string,
            sourceEntity: r.sourceEntity as string,
            targetEntity: r.targetEntity as string,
            relationshipStage: (r.relationshipStage as string) || "acquaintance",
          })
        );
        requestAnimationFrame(() => {
          setRelationships(list);
          if (list.length > 0) {
            setSelectedRelId(list[0].id);
          }
        });
      } catch (err: unknown) {
        requestAnimationFrame(() => {
          setRelsError(err instanceof Error ? err.message : "Failed to load relationships");
        });
      } finally {
        requestAnimationFrame(() => {
          setLoadingRels(false);
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [sessionUniverseId]);

  // ── Fetch evolution data ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedRelId) {
      const frame = requestAnimationFrame(() => {
        setEvolutionData([]);
      });
      return () => cancelAnimationFrame(frame);
    }
    const frame = requestAnimationFrame(async () => {
      setLoadingEvolution(true);
      setEvolutionError(null);
      try {
        const res = await fetch(`/api/relationships/${selectedRelId}/evolution`);
        if (!res.ok) throw new Error("Failed to load evolution data");
        const json = await res.json();
        requestAnimationFrame(() => {
          setEvolutionData(json.history || []);
        });
      } catch (err: unknown) {
        requestAnimationFrame(() => {
          setEvolutionError(err instanceof Error ? err.message : "Failed to load evolution data");
          setEvolutionData([]);
        });
      } finally {
        requestAnimationFrame(() => {
          setLoadingEvolution(false);
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedRelId]);

  // ── Computed: enriched timeline entries ─────────────────────────────────
  const timelineEntries = useMemo((): TimelineEntry[] => {
    return evolutionData.map((entry, i, arr) => {
      const prev = i > 0 ? arr[i - 1] : null;
      return {
        ...entry,
        previousEmotionalState: prev?.emotionalState,
        stageChanged: prev ? prev.relationshipStage !== entry.relationshipStage : false,
        isAnchor: isAnchorEntry(entry, i, arr),
        dominantEmotionBefore: prev ? getDominantEmotion(prev.emotionalState) : null,
        dominantEmotionAfter: getDominantEmotion(entry.emotionalState),
      };
    });
  }, [evolutionData]);

  // ── Group by day ─────────────────────────────────────────────────────────
  const groupedByDay = useMemo(() => {
    const groups: Record<string, TimelineEntry[]> = {};
    for (const entry of timelineEntries) {
      const day = new Date(entry.recordedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      if (!groups[day]) groups[day] = [];
      groups[day].push(entry);
    }
    return groups;
  }, [timelineEntries]);

  const dayKeys = useMemo(() => Object.keys(groupedByDay), [groupedByDay]);

  // ── Toggle day expand ───────────────────────────────────────────────────
  const toggleDay = useCallback((day: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

  // Auto-expand first day on data load
  useEffect(() => {
    if (dayKeys.length > 0) {
      const frame = requestAnimationFrame(() => {
        setExpandedDays(new Set([dayKeys[0]]));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [dayKeys]);

  // ── Select relationship ─────────────────────────────────────────────────
  const handleRelChange = useCallback((relId: string) => {
    setSelectedRelId(relId);
    setFilterOpen(false);
  }, []);

  // ── Format time from ISO ────────────────────────────────────────────────
  const formatTime = useCallback((iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }, []);

  // ── Format relative time ────────────────────────────────────────────────
  const formatRelativeTime = useCallback((iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / TIME.ONE_MINUTE);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }, []);

  // ── Selected relationship ───────────────────────────────────────────────
  const selectedRel = relationships.find((r) => r.id === selectedRelId);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="border-b border-border-default bg-bg-raised">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-accent" />
          <h3 className="text-xs font-semibold text-text-primary">Relationship Timeline</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
          title="Close timeline panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Relationship Filter ─────────────────────────────────────────── */}
      <div className="relative border-b border-border-default px-4 py-2.5">
        {loadingRels ? (
          <div className="flex items-center gap-2 text-text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xxs">Loading relationships...</span>
          </div>
        ) : relsError ? (
          <div className="flex items-center gap-2 text-error">
            <HeartCrack className="h-3 w-3" />
            <span className="text-xxs">{relsError}</span>
          </div>
        ) : relationships.length === 0 ? (
          <div className="flex items-center gap-2 text-text-muted">
            <Heart className="h-3 w-3" />
            <span className="text-xxs">No relationships found for this session</span>
          </div>
        ) : (
          <>
            {/* Selected relationship display */}
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-left transition-colors hover:border-border-strong"
            >
              <span className="flex items-center gap-2 text-xs text-text-primary">
                <Filter className="h-3 w-3 text-text-muted" />
                {selectedRel
                  ? `${selectedRel.sourceEntity} ↔ ${selectedRel.targetEntity}`
                  : "Select relationship"}
              </span>
              <ChevronDown
                className={`h-3 w-3 text-text-muted transition-transform ${filterOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown */}
            {filterOpen && (
              <div className="absolute left-4 right-4 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-default bg-bg-elevated shadow-lg">
                {relationships.map((rel) => (
                  <button
                    key={rel.id}
                    onClick={() => handleRelChange(rel.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      rel.id === selectedRelId
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                    }`}
                  >
                    <Heart
                      className={`h-3 w-3 shrink-0 ${
                        rel.id === selectedRelId ? "text-accent" : "text-text-muted"
                      }`}
                    />
                    <span className="truncate">{rel.sourceEntity}</span>
                    <ArrowRight className="h-2.5 w-2.5 shrink-0 text-text-muted" />
                    <span className="truncate">{rel.targetEntity}</span>
                    <span className="ml-auto shrink-0 text-xxs text-text-muted capitalize">
                      {rel.relationshipStage.replace(/_/g, " ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Timeline Content ────────────────────────────────────────────── */}
      <div className="max-h-80 overflow-y-auto px-4 py-3">
        {!selectedRelId ? (
          <div className="flex flex-col items-center gap-2 py-8 text-text-muted">
            <Heart className="h-6 w-6 opacity-30" />
            <p className="text-xs">Select a relationship to view its timeline</p>
          </div>
        ) : loadingEvolution ? (
          <div className="flex items-center justify-center gap-2 py-8 text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Loading evolution...</span>
          </div>
        ) : evolutionError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-error">
            <HeartCrack className="h-5 w-5" />
            <p className="text-xs">{evolutionError}</p>
          </div>
        ) : timelineEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-text-muted">
            <Clock className="h-5 w-5 opacity-30" />
            <p className="text-xs">No evolution history yet</p>
            <p className="text-xxs opacity-60">Emotional states are recorded during roleplay sessions</p>
          </div>
        ) : (
          /* ── Timeline ────────────────────────────────────────────────── */
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border-default" />

            {/* Day groups */}
            {dayKeys.map((day) => {
              const entries = groupedByDay[day];
              const isExpanded = expandedDays.has(day);
              const isSingleDay = dayKeys.length === 1;
              // Auto-expand if only one day
              const showEntries = isExpanded || isSingleDay;

              return (
                <div key={day} className="mb-4 last:mb-0">
                  {/* Day header */}
                  <button
                    onClick={() => toggleDay(day)}
                    className="relative z-10 flex items-center gap-2 py-1 text-xxs font-medium text-text-muted hover:text-text-secondary transition-colors"
                  >
                    <div className="h-3 w-3 rounded-full border border-border-strong bg-bg-raised flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-accent/60" />
                    </div>
                    <span>{day}</span>
                    <span className="text-xxs opacity-50">
                      ({entries.length} event{entries.length !== 1 ? "s" : ""})
                    </span>
                    {!isSingleDay && (
                      showEntries ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )
                    )}
                  </button>

                  {/* Entries for this day */}
                  {showEntries && (
                    <div className="ml-5 space-y-0">
                      {entries.map((entry, entryIdx) => (
                        <TimelineEntryRow
                          key={entry.id}
                          entry={entry}
                          isLast={entryIdx === entries.length - 1}
                          formatTime={formatTime}
                          formatRelativeTime={formatRelativeTime}
                          onSelect={setSelectedEntry}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail Modal ────────────────────────────────────────────────── */}
      {selectedEntry && (
        <Modal
          open={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
          title="Evolution Detail"
          size="lg"
        >
          <EvolutionDetail
            entry={selectedEntry}
            relationshipName={selectedRel
              ? `${selectedRel.sourceEntity} ↔ ${selectedRel.targetEntity}`
              : ""}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Timeline Entry Row ──────────────────────────────────────────────────────

const TimelineEntryRow = memo(function TimelineEntryRow({
  entry,
  isLast,
  formatTime,
  formatRelativeTime,
  onSelect,
}: {
  entry: TimelineEntry;
  isLast: boolean;
  formatTime: (iso: string) => string;
  formatRelativeTime: (iso: string) => string;
  onSelect: (entry: TimelineEntry) => void;
}) {
  const direction = getEmotionDirection(entry, POSITIVE_EMOTIONS);

  const directionColor =
    direction === "improving"
      ? "text-success"
      : direction === "worsening"
      ? "text-error"
      : "text-text-muted";

  const directionLabel =
    direction === "improving"
      ? "Improving"
      : direction === "worsening"
      ? "Worsening"
      : null;

  return (
    <button
      onClick={() => onSelect(entry)}
      className="group relative flex w-full gap-3 py-2 text-left transition-colors hover:bg-bg-elevated/50 rounded-lg px-2 -ml-2"
    >
      {/* Timeline dot + connector */}
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div
          className={`h-2 w-2 rounded-full border ${
            entry.isAnchor
              ? "border-amber-500 bg-amber-500/30"
              : direction === "improving"
              ? "border-success bg-success/30"
              : direction === "worsening"
              ? "border-error bg-error/30"
              : "border-border-strong bg-bg-raised"
          }`}
        />
        {!isLast && <div className="w-px flex-1 bg-border-default mt-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        {/* Top row: time + anchor badge + direction */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xxs text-text-muted shrink-0">
            {formatTime(entry.recordedAt)}
          </span>
          <span className="text-xxs text-text-muted/50 shrink-0">
            {formatRelativeTime(entry.recordedAt)}
          </span>

          {entry.isAnchor && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xxs text-amber-400 shrink-0">
              <Anchor className="h-2.5 w-2.5" />
              Milestone
            </span>
          )}

          {entry.stageChanged && entry.relationshipStage && (
            <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-xxs text-accent capitalize shrink-0">
              {entry.relationshipStage.replace(/_/g, " ")}
            </span>
          )}

          <span className={`ml-auto text-xxs ${directionColor} shrink-0`}>
            {directionLabel}
          </span>
        </div>

        {/* Emotional state change arrow */}
        <div className="flex items-center gap-1.5 mb-1">
          {entry.previousEmotionalState && entry.dominantEmotionBefore ? (
            <span className="inline-block rounded bg-bg-highlight px-1.5 py-0.5 text-xxs capitalize text-text-secondary">
              {entry.dominantEmotionBefore}
            </span>
          ) : (
            <span className="inline-block rounded bg-bg-highlight px-1.5 py-0.5 text-xxs text-text-muted">
              start
            </span>
          )}
          <ArrowRight className={`h-3 w-3 ${directionColor}`} />
          {entry.dominantEmotionAfter ? (
            <span className="inline-block rounded bg-bg-highlight px-1.5 py-0.5 text-xxs capitalize text-text-primary font-medium">
              {entry.dominantEmotionAfter}
            </span>
          ) : (
            <span className="text-xxs text-text-muted">—</span>
          )}
        </div>

        {/* Trigger event */}
        {entry.triggerEvent && (
          <p className="text-xxs text-text-muted italic line-clamp-2">
            &ldquo;{entry.triggerEvent}&rdquo;
          </p>
        )}
      </div>
    </button>
  );
});

// ── Evolution Detail Modal Content ──────────────────────────────────────────

const EvolutionDetail = memo(function EvolutionDetail({
  entry,
  relationshipName,
}: {
  entry: TimelineEntry;
  relationshipName: string;
}) {
  const direction = getEmotionDirection(entry, POSITIVE_EMOTIONS);

  // Compute emotion changes
  const emotionChanges = useMemo(() => {
    const changes: { name: string; before: number; after: number; diff: number }[] = [];
    const allEmotions = new Set([
      ...Object.keys(entry.previousEmotionalState || {}),
      ...Object.keys(entry.emotionalState),
    ]);
    for (const emotion of allEmotions) {
      const before = entry.previousEmotionalState?.[emotion] ?? 0;
      const after = entry.emotionalState[emotion] ?? 0;
      if (before !== after) {
        changes.push({ name: emotion, before, after, diff: after - before });
      }
    }
    return changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [entry]);

  return (
    <div className="space-y-4">
      {/* Relationship name */}
      <div>
        <p className="text-xxs text-text-muted">Relationship</p>
        <p className="text-xs font-medium text-text-primary">{relationshipName}</p>
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-2">
        <Clock className="h-3 w-3 text-text-muted" />
        <span className="text-xs text-text-secondary">
          {new Date(entry.recordedAt).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Anchor badge */}
      {entry.isAnchor && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <Anchor className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-400">Narrative Milestone</p>
            <p className="text-xxs text-text-muted">
              {entry.relationshipStage
                ? `Relationship evolved to "${entry.relationshipStage.replace(/_/g, " ")}"`
                : "Significant relationship event"}
            </p>
          </div>
        </div>
      )}

      {/* Stage change */}
      {entry.stageChanged && (
        <div>
          <p className="text-xxs text-text-muted mb-1">Relationship Stage</p>
          <div className="flex items-center gap-2">
            {entry.previousEmotionalState && (
              <span className="rounded bg-bg-highlight px-2 py-1 text-xs text-text-muted capitalize">
                {entry.previousEmotionalState
                  ? `stage before`
                  : "—"}
              </span>
            )}
            <ArrowRight className="h-3 w-3 text-accent" />
            {entry.relationshipStage && (
              <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent capitalize">
                {entry.relationshipStage.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Trigger event */}
      {entry.triggerEvent && (
        <div>
          <p className="text-xxs text-text-muted mb-1">Trigger Event</p>
          <div className="rounded-lg border border-border-default bg-bg-elevated px-3 py-2">
            <p className="text-xs text-text-primary italic">&ldquo;{entry.triggerEvent}&rdquo;</p>
          </div>
        </div>
      )}

      {/* Emotional state comparison */}
      <div>
        <p className="text-xxs text-text-muted mb-2">
          Emotional State
          {direction && (
            <span
              className={`ml-2 inline-flex items-center gap-1 text-xxs ${
                direction === "improving"
                  ? "text-success"
                  : direction === "worsening"
                  ? "text-error"
                  : "text-text-muted"
              }`}
            >
              ({direction === "improving" ? "↑" : direction === "worsening" ? "↓" : "→"}{" "}
              {direction})
            </span>
          )}
        </p>
        <div className="space-y-2">
          {/* Current emotions */}
          {Object.entries(entry.emotionalState)
            .sort(([, a], [, b]) => b - a)
            .map(([key, val]) => (
              <EmotionBar key={key} label={key} value={val} />
            ))}
        </div>
      </div>

      {/* Emotion changes */}
      {emotionChanges.length > 0 && (
        <div>
          <p className="text-xxs text-text-muted mb-2">Changes from Previous State</p>
          <div className="space-y-1.5">
            {emotionChanges.slice(0, 10).map((change) => (
              <div
                key={change.name}
                className="flex items-center gap-2 rounded bg-bg-elevated px-2 py-1.5"
              >
                <span className="w-20 text-xxs capitalize text-text-secondary">{change.name}</span>
                <span className="text-xxs text-text-muted">{change.before.toFixed(2)}</span>
                <ArrowRight
                  className={`h-2.5 w-2.5 ${
                    change.diff > 0 ? "text-success" : change.diff < 0 ? "text-error" : "text-text-muted"
                  }`}
                />
                <span className="text-xxs text-text-primary font-medium">{change.after.toFixed(2)}</span>
                <span
                  className={`ml-auto text-xxs font-medium ${
                    change.diff > 0 ? "text-success" : change.diff < 0 ? "text-error" : "text-text-muted"
                  }`}
                >
                  {change.diff > 0 ? "+" : ""}{change.diff.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
