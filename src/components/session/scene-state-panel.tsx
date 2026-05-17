"use client";

/**
 * SceneStatePanel Component
 *
 * Displays and edits scene state (location, goal, tone, active NPCs/threads).
 * Extracted from session/[id]/page.tsx.
 *
 * Usage:
 *   <SceneStatePanel
 *     scene={sceneState}
 *     onSave={(data) => handleSave(data)}
 *     onClose={() => setShowPanel(false)}
 *   />
 */

"use client";

import { useState } from "react";
import { MapPin, Target, Palette, Users, GitBranch, MessageCircle } from "lucide-react";

interface SceneState {
  active_location_id: string | null;
  current_goal: string | null;
  emotional_tone: string | null;
  active_npcs: string | null;
  active_threads: string | null;
  scene_summary: string | null;
}

interface SceneStatePanelProps {
  scene: SceneState | null;
  onSave: (data: {
    location: string | null;
    goal: string | null;
    tone: string | null;
    activeNpcs: string[] | null;
    activeThreads: string[] | null;
    sceneSummary: string | null;
  }) => void;
  onClose: () => void;
}

export function SceneStatePanel({ scene, onSave, onClose }: SceneStatePanelProps) {
  const [edit, setEdit] = useState({
    location: scene?.active_location_id || "",
    goal: scene?.current_goal || "",
    tone: scene?.emotional_tone || "",
    activeNpcs: scene?.active_npcs ? JSON.parse(scene.active_npcs) : [] as string[],
    activeThreads: scene?.active_threads ? JSON.parse(scene.active_threads) : [] as string[],
    sceneSummary: scene?.scene_summary || "",
  });

  function handleSave() {
    onSave({
      location: edit.location || null,
      goal: edit.goal || null,
      tone: edit.tone || null,
      activeNpcs: edit.activeNpcs.length > 0 ? edit.activeNpcs : null,
      activeThreads: edit.activeThreads.length > 0 ? edit.activeThreads : null,
      sceneSummary: edit.sceneSummary || null,
    });
  }

  return (
    <div className="border-b border-border-default bg-bg-raised px-4 py-3">
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="flex items-center gap-1 text-xxs font-medium text-text-muted mb-1">
            <MapPin className="h-3 w-3" /> Location
          </label>
          <input
            value={edit.location}
            onChange={(e) => setEdit({ ...edit, location: e.target.value })}
            className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
            placeholder="e.g. Dark Forest"
          />
        </div>
        <div>
          <label className="flex items-center gap-1 text-xxs font-medium text-text-muted mb-1">
            <Target className="h-3 w-3" /> Goal
          </label>
          <input
            value={edit.goal}
            onChange={(e) => setEdit({ ...edit, goal: e.target.value })}
            className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
            placeholder="e.g. Find the artifact"
          />
        </div>
        <div>
          <label className="flex items-center gap-1 text-xxs font-medium text-text-muted mb-1">
            <Palette className="h-3 w-3" /> Tone
          </label>
          <input
            value={edit.tone}
            onChange={(e) => setEdit({ ...edit, tone: e.target.value })}
            className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
            placeholder="e.g. Mysterious"
          />
        </div>
      </div>

      {/* Active NPCs */}
      <div className="mb-3">
        <label className="flex items-center gap-1 text-xxs font-medium text-text-muted mb-1">
          <Users className="h-3 w-3" /> Active NPCs (comma-separated)
        </label>
        <input
          value={edit.activeNpcs.join(", ")}
          onChange={(e) =>
            setEdit({ ...edit, activeNpcs: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
          className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
          placeholder="e.g. Haleth, Aragorn, Gandalf"
        />
      </div>

      {/* Active Threads */}
      <div className="mb-3">
        <label className="flex items-center gap-1 text-xxs font-medium text-text-muted mb-1">
          <GitBranch className="h-3 w-3" /> Active Threads (comma-separated)
        </label>
        <input
          value={edit.activeThreads.join(", ")}
          onChange={(e) =>
            setEdit({ ...edit, activeThreads: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
          className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
          placeholder="e.g. Missing traveler, Orc sightings"
        />
      </div>

      {/* Scene Summary */}
      <div className="mb-3">
        <label className="flex items-center gap-1 text-xxs font-medium text-text-muted mb-1">
          <MessageCircle className="h-3 w-3" /> Scene Summary
        </label>
        <textarea
          value={edit.sceneSummary}
          onChange={(e) => setEdit({ ...edit, sceneSummary: e.target.value })}
          className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary resize-none"
          placeholder="Brief description of the current scene..."
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-1.5">
        <button
          onClick={onClose}
          className="rounded-md bg-bg-elevated px-3 py-1 text-xxs text-text-secondary hover:bg-bg-highlight"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="rounded-md bg-accent px-3 py-1 text-xxs text-white hover:bg-accent-hover"
        >
          Save Scene
        </button>
      </div>
    </div>
  );
}
