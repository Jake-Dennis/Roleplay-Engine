"use client";

/**
 * NarrativeStatePanel Component
 *
 * Debug overlay showing current scene state, narrative state fields,
 * state history, and prompt preview. Toggle with Ctrl+Shift+N.
 *
 * Usage:
 *   <NarrativeStatePanel
 *     sessionId={sessionId}
 *     sceneState={sceneState}
 *     session={session}
 *   />
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BrainCircuit,
  Activity,
  Clock,
  BarChart3,
  Eye,
  X,
} from "lucide-react";
import { safeParse } from "@/lib/safe-json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SceneState {
  id?: string;
  session_id?: string;
  active_location_id?: string | null;
  current_goal?: string | null;
  emotional_tone?: string | null;
  current_intent?: string | null;
  active_npcs?: string | null;
  active_threads?: string | null;
  scene_summary?: string | null;
  scene_type?: string | null;
  scene_tension?: number | null;
  conflict_type?: string | null;
  stakes?: string | null;
  updated_at?: string;
}

interface SceneGoal {
  goal: string;
  progress: string;
}

interface SceneConflict {
  conflict: string;
  parties: string[];
}

interface StateSnapshot {
  timestamp: string;
  location: string | null;
  goal: string | null;
  tone: string | null;
  sceneType: string | null;
  tension: number | null;
}

interface RawSceneApiResponse {
  sceneState?: {
    id?: string;
    location?: string | null;
    goal?: string | null;
    tone?: string | null;
    activeNpcs?: string[];
    activeThreads?: string[];
    sceneSummary?: string | null;
    updatedAt?: string;
  };
}

interface NarrativeStatePanelProps {
  sessionId: string;
  sceneState: SceneState | null;
  /** Session object with camelized narrative fields (narrativeTension, pacing, etc.) */
  session: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Section sub-component
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-default last:border-b-0">
      <div className="flex items-center gap-1.5 border-b border-border-default bg-bg-elevated px-3 py-1.5">
        <span className="text-accent">{icon}</span>
        <h4 className="text-xxs font-semibold uppercase tracking-wider text-text-secondary">
          {title}
        </h4>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field row
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  value,
  empty = "—",
}: {
  label: string;
  value: unknown;
  empty?: string;
}) {
  const displayValue =
    value === null || value === undefined || value === ""
      ? empty
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  return (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <span className="text-xxs text-text-muted shrink-0">{label}</span>
      <span className="text-xxs text-text-primary text-right break-all max-w-[220px] font-mono">
        {displayValue}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NarrativeStatePanel({
  sessionId,
  sceneState,
  session,
}: NarrativeStatePanelProps) {
  const [visible, setVisible] = useState(false);
  const [sceneDetail, setSceneDetail] = useState<Record<string, unknown> | null>(null);

  // Track state history in-memory (last 20 snapshots)
  const historyRef = useRef<StateSnapshot[]>([]);
  const [history, setHistory] = useState<StateSnapshot[]>([]);

  // Refresh counter to re-fetch scene detail
  const refreshCounterRef = useRef(0);

  // -----------------------------------------------------------------------
  // Keyboard shortcut: Ctrl+Shift+N to toggle
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault();
        setVisible((v) => !v);
      }
      if (e.key === "Escape" && visible) {
        setVisible(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  // -----------------------------------------------------------------------
  // Fetch scene detail from the scene API on mount and when visible
  // -----------------------------------------------------------------------
  const fetchSceneDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/scene`);
      if (res.ok) {
        const data: RawSceneApiResponse = await res.json();
        setSceneDetail((data.sceneState as Record<string, unknown>) ?? null);
      }
    } catch {
      // Silently fail
    }
  }, [sessionId]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      fetchSceneDetail();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, fetchSceneDetail]);

  // -----------------------------------------------------------------------
  // Track state history — push a snapshot when sceneState changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!sceneState?.updated_at) return;
    const snapshot: StateSnapshot = {
      timestamp: sceneState.updated_at,
      location: sceneState.active_location_id ?? null,
      goal: sceneState.current_goal ?? null,
      tone: sceneState.emotional_tone ?? null,
      sceneType: sceneState.scene_type ?? null,
      tension: sceneState.scene_tension ?? null,
    };

    // Avoid duplicates (same timestamp)
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev || prev.timestamp !== snapshot.timestamp) {
      historyRef.current.push(snapshot);
      if (historyRef.current.length > 20) {
        historyRef.current = historyRef.current.slice(-20);
      }
      const frame = requestAnimationFrame(() => {
        setHistory([...historyRef.current]);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [sceneState]);

  // -----------------------------------------------------------------------
  // Resolve scene-level fields from prop or fetched detail
  // -----------------------------------------------------------------------
  const getSceneField = (key: string): unknown => {
    // Try the API detail first (richer data)
    if (sceneDetail && sceneDetail[key] !== undefined) {
      return sceneDetail[key];
    }
    // Fall back to the sceneState prop (snake_case keys from DB)
    if (sceneState) {
      const propKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      const propKey2 = key.charAt(0).toLowerCase() + key.slice(1);
      return (sceneState as Record<string, unknown>)[propKey] ??
        (sceneState as Record<string, unknown>)[propKey2] ??
        undefined;
    }
    return undefined;
  };

  const location = sceneState?.active_location_id ?? getSceneField("location");
  const goal = sceneState?.current_goal ?? getSceneField("goal");
  const tone = sceneState?.emotional_tone ?? getSceneField("tone");
  const npcsRaw = sceneState?.active_npcs ?? getSceneField("activeNpcs");
  const threadsRaw = sceneState?.active_threads ?? getSceneField("activeThreads");
  const sceneType = sceneState?.scene_type ?? getSceneField("sceneType");
  const sceneTension = sceneState?.scene_tension ?? getSceneField("sceneTension");
  const conflictType = sceneState?.conflict_type ?? getSceneField("conflictType");
  const stakes = sceneState?.stakes ?? getSceneField("stakes");
  const currentIntent = sceneState?.current_intent ?? getSceneField("currentIntent");

  // Resolve active NPCs / threads (could be JSON string or parsed array)
  const activeNpcs = typeof npcsRaw === "string"
    ? safeParse<string[]>(npcsRaw, []) ?? []
    : Array.isArray(npcsRaw) ? npcsRaw : [];

  const activeThreads = typeof threadsRaw === "string"
    ? safeParse<string[]>(threadsRaw, []) ?? []
    : Array.isArray(threadsRaw) ? threadsRaw : [];

  // -----------------------------------------------------------------------
  // Narrative state from session (camelized by the API)
  // -----------------------------------------------------------------------
  const narrativeTension = (session?.narrativeTension as number | null) ?? null;
  const pacing = (session?.pacing as number | null) ?? null;
  const narrativePhase = (session?.narrativePhase as string | null) ?? null;
  const activeGoalsRaw = (session?.activeGoals as string | null) ?? null;
  const activeConflictsRaw = (session?.activeConflicts as string | null) ?? null;

  const activeGoals = safeParse<SceneGoal[]>(activeGoalsRaw, []) ?? [];
  const activeConflicts = safeParse<SceneConflict[]>(activeConflictsRaw, []) ?? [];

  // -----------------------------------------------------------------------
  // Build prompt preview — mimics prompt-builder.ts [CURRENT SCENE] rendering
  // -----------------------------------------------------------------------
  const promptLines: string[] = ["[CURRENT SCENE]"];

  if (location) promptLines.push(`Location: ${location}`);
  if (goal) promptLines.push(`Goal: ${goal}`);
  if (tone) promptLines.push(`Tone: ${tone}`);
  if (activeNpcs.length > 0) {
    promptLines.push(`Present: ${activeNpcs.join(", ")}`);
  }
  if (sceneType) promptLines.push(`Scene Type: ${sceneType}`);
  if (sceneTension != null) promptLines.push(`Tension: ${Number(sceneTension).toFixed(2)}/1.0`);
  if (conflictType) {
    promptLines.push(
      stakes
        ? `Conflict: ${conflictType} (${stakes})`
        : `Conflict: ${conflictType}`
    );
  }
  if (narrativePhase) promptLines.push(`Narrative Phase: ${narrativePhase}`);
  if (narrativeTension != null) promptLines.push(`Overall Tension: ${narrativeTension.toFixed(2)}/1.0`);
  if (pacing != null) promptLines.push(`Pacing: ${pacing.toFixed(2)}/1.0`);

  if (activeGoals.length > 0) {
    promptLines.push("Active Goals:");
    activeGoals.slice(0, 5).forEach((g) => {
      const label = typeof g === "string" ? g : g.goal;
      const progress = typeof g === "object" && g.progress ? ` (${g.progress})` : "";
      promptLines.push(`\u2022 ${label}${progress}`);
    });
  }

  if (activeConflicts.length > 0) {
    promptLines.push("Active Conflicts:");
    activeConflicts.slice(0, 5).forEach((c) => {
      const label = typeof c === "string" ? c : c.conflict;
      const parties =
        typeof c === "object" && c.parties?.length
          ? ` — parties: ${c.parties.join(", ")}`
          : "";
      promptLines.push(`\u2022 ${label}${parties}`);
    });
  }

  const promptText = promptLines.join("\n");

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Toggle button — visible when panel is hidden */}
      {!visible && (
        <button
          onClick={() => setVisible(true)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-lg bg-bg-raised border border-border-default px-3 py-1.5 text-xxs text-text-muted hover:text-text-secondary hover:border-border-strong transition-colors shadow-lg"
          title="Open Narrative State Debug (Ctrl+Shift+N)"
        >
          <BrainCircuit className="h-3.5 w-3.5" />
          <span>Narrative Debug</span>
        </button>
      )}

      {/* Overlay */}
      {visible && (
        <div className="fixed inset-y-0 right-0 z-50 flex">
          {/* Backdrop for clicking outside (optional — clicking backdrop closes) */}
          <div
            className="fixed inset-0 bg-black/20"
            onClick={() => setVisible(false)}
          />

          {/* Panel */}
          <div className="relative w-96 bg-bg-base border-l border-border-default shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-default bg-bg-elevated px-3 py-2">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-accent" />
                <h3 className="text-xs font-semibold text-text-primary">
                  Narrative State Debug
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xxs text-text-muted hidden sm:inline">
                  Ctrl+Shift+N
                </span>
                <button
                  onClick={() => setVisible(false)}
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
                  title="Close (Escape)"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* Scene State */}
              <Section icon={<Eye className="h-3 w-3" />} title="Scene State">
                <FieldRow label="Location" value={location} />
                <FieldRow label="Goal" value={goal} />
                <FieldRow label="Tone" value={tone} />
                <FieldRow label="Emotional Tone" value={tone} />
                <FieldRow label="Current Intent" value={currentIntent} />
                <FieldRow label="Scene Type" value={sceneType} />
                <FieldRow
                  label="Scene Tension"
                  value={
                    sceneTension != null
                      ? `${Number(sceneTension).toFixed(2)}/1.0`
                      : null
                  }
                />
                <FieldRow label="Conflict Type" value={conflictType} />
                <FieldRow label="Stakes" value={stakes} />
                <FieldRow
                  label="Active NPCs"
                  value={
                    activeNpcs.length > 0
                      ? activeNpcs.join(", ")
                      : null
                  }
                />
                <FieldRow
                  label="Active Threads"
                  value={
                    activeThreads.length > 0
                      ? activeThreads.join(", ")
                      : null
                  }
                />
                <FieldRow label="Updated At" value={sceneState?.updated_at || null} />
              </Section>

              {/* Narrative State */}
              <Section
                icon={<Activity className="h-3 w-3" />}
                title="Narrative State"
              >
                <FieldRow label="Narrative Phase" value={narrativePhase} />
                <FieldRow
                  label="Tension"
                  value={
                    narrativeTension != null
                      ? `${narrativeTension.toFixed(2)}/1.0`
                      : null
                  }
                />
                <FieldRow
                  label="Pacing"
                  value={
                    pacing != null
                      ? `${pacing.toFixed(2)}/1.0`
                      : null
                  }
                />
                <FieldRow
                  label="Active Goals"
                  value={
                    activeGoals.length > 0
                      ? activeGoals
                          .slice(0, 5)
                          .map((g) => {
                            const label =
                              typeof g === "string" ? g : g.goal;
                            const progress =
                              typeof g === "object" && g.progress
                                ? ` (${g.progress})`
                                : "";
                            return `${label}${progress}`;
                          })
                          .join("\n")
                      : null
                  }
                />
                <FieldRow
                  label="Active Conflicts"
                  value={
                    activeConflicts.length > 0
                      ? activeConflicts
                          .slice(0, 5)
                          .map((c) => {
                            const label =
                              typeof c === "string" ? c : c.conflict;
                            const parties =
                              typeof c === "object" && c.parties?.length
                                ? ` [${c.parties.join(", ")}]`
                                : "";
                            return `${label}${parties}`;
                          })
                          .join("\n")
                      : null
                  }
                />
              </Section>

              {/* Prompt Preview */}
              <Section
                icon={<BrainCircuit className="h-3 w-3" />}
                title="Prompt Preview"
              >
                <pre className="whitespace-pre-wrap text-xxs font-mono text-text-primary bg-bg-elevated rounded p-2 border border-border-default leading-relaxed">
                  {promptText}
                </pre>
                <div className="mt-1.5 text-xxs text-text-muted">
                  ↑ This is what gets injected into the next LLM prompt as{" "}
                  <code className="bg-bg-raised px-1 rounded">[CURRENT SCENE]</code>
                </div>
              </Section>

              {/* State History */}
              <Section
                icon={<Clock className="h-3 w-3" />}
                title="State History"
              >
                {history.length === 0 ? (
                  <div className="text-xxs text-text-muted py-1">
                    No state changes recorded yet. State snapshots are tracked
                    in-memory while this panel is open.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {[...history].reverse().map((snap, i) => (
                      <div
                        key={`${snap.timestamp}-${i}`}
                        className="rounded border border-border-default bg-bg-elevated/50 px-2 py-1"
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xxs text-text-muted font-mono">
                            {new Date(snap.timestamp).toLocaleTimeString()}
                          </span>
                          {i === 0 && (
                            <span className="text-xxs text-accent font-medium">
                              current
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                          <span className="text-xxs text-text-muted truncate">
                            📍 {snap.location || "—"}
                          </span>
                          <span className="text-xxs text-text-muted truncate">
                            🎯 {snap.goal || "—"}
                          </span>
                          <span className="text-xxs text-text-muted truncate">
                            🎨 {snap.tone || "—"}
                          </span>
                          <span className="text-xxs text-text-muted truncate">
                            ⚡ {snap.sceneType || "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* Footer */}
            <div className="border-t border-border-default bg-bg-elevated px-3 py-1.5">
              <div className="flex items-center justify-between text-xxs text-text-muted">
                <span>
                  Session:{" "}
                  <code className="bg-bg-raised px-1 rounded font-mono">
                    {sessionId.slice(0, 8)}…
                  </code>
                </span>
                <button
                  onClick={() => {
                    refreshCounterRef.current++;
                    fetchSceneDetail();
                  }}
                  className="rounded px-1.5 py-0.5 hover:bg-bg-raised hover:text-text-secondary transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
