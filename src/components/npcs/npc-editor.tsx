"use client";

import { Users, Save, Trash2, X, Shield, Sparkles } from "lucide-react";

interface Universe {
  id: string;
  name: string;
}

interface NpcEditorProps {
  selectedId: string | null;
  creating: boolean;
  formName: string;
  formDescription: string;
  formPersonalityTraits: string;
  formBehaviorPatterns: string;
  formVoiceId: string;
  formIsCanon: boolean;
  formUniverseId: string;
  universes: Universe[];
  saving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPersonalityTraitsChange: (value: string) => void;
  onBehaviorPatternsChange: (value: string) => void;
  onVoiceIdChange: (value: string) => void;
  onIsCanonChange: (value: boolean) => void;
  onUniverseIdChange: (value: string) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}

export function NpcEditor({
  selectedId,
  creating,
  formName,
  formDescription,
  formPersonalityTraits,
  formBehaviorPatterns,
  formVoiceId,
  formIsCanon,
  formUniverseId,
  universes,
  saving,
  onNameChange,
  onDescriptionChange,
  onPersonalityTraitsChange,
  onBehaviorPatternsChange,
  onVoiceIdChange,
  onIsCanonChange,
  onUniverseIdChange,
  onSave,
  onDelete,
  onCancel,
}: NpcEditorProps) {
  if (!selectedId && !creating) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Users className="mx-auto h-10 w-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary mb-1">Select or create an NPC</p>
          <p className="text-xs text-text-muted">Non-player characters for your roleplay sessions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-bg-raised flex items-center justify-center text-text-muted">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{formName || "New NPC"}</h2>
            {formIsCanon && (
              <span className="text-[10px] text-success flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Canon character
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={saving || !formName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
          {selectedId && (
            <button
              onClick={() => onDelete(selectedId)}
              className="flex items-center gap-1 rounded-lg bg-error/10 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {creating && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Name *</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Character name"
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
          />
        </div>

        {/* Universe selector */}
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Universe</label>
          <p className="text-[10px] text-text-muted mb-1">Which universe this NPC belongs to</p>
          <select
            value={formUniverseId}
            onChange={(e) => onUniverseIdChange(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
          >
            <option value="">Select universe...</option>
            {universes.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Description</label>
          <p className="text-[10px] text-text-muted mb-1">Physical appearance, background, role in the story</p>
          <textarea
            value={formDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="A mysterious figure cloaked in shadows..."
            rows={4}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
          />
        </div>

        {/* Personality Traits */}
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Personality Traits</label>
          <p className="text-[10px] text-text-muted mb-1">Key character traits, motivations, flaws. One per line or comma-separated.</p>
          <textarea
            value={formPersonalityTraits}
            onChange={(e) => onPersonalityTraitsChange(e.target.value)}
            placeholder="Cunning, paranoid, fiercely loyal to family, speaks in riddles when nervous"
            rows={4}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
          />
        </div>

        {/* Behavior Patterns */}
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Behavior Patterns</label>
          <p className="text-[10px] text-text-muted mb-1">How the NPC acts in different situations. Habits, quirks, reactions.</p>
          <textarea
            value={formBehaviorPatterns}
            onChange={(e) => onBehaviorPatternsChange(e.target.value)}
            placeholder="Avoids direct eye contact. Taps fingers when lying. Becomes verbose when discussing their craft."
            rows={4}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
          />
        </div>

        {/* Voice ID */}
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Voice ID</label>
          <p className="text-[10px] text-text-muted mb-1">TTS voice identifier for this NPC (if using text-to-speech)</p>
          <input
            type="text"
            value={formVoiceId}
            onChange={(e) => onVoiceIdChange(e.target.value)}
            placeholder="e.g. en-US-neural-male-01"
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
          />
        </div>

        {/* Canon toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border-default bg-bg-raised px-4 py-3">
          <div>
            <label className="text-xs text-text-secondary flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Canon Character
            </label>
            <p className="text-[10px] text-text-muted mt-0.5">Mark as part of the official storyline</p>
          </div>
          <button
            onClick={() => onIsCanonChange(!formIsCanon)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              formIsCanon ? "bg-accent" : "bg-bg-highlight"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                formIsCanon ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
