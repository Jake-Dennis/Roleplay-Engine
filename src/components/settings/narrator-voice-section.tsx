"use client";

import { Check, Save, Sparkles, Volume2 } from "lucide-react";

interface Voice {
  id: string;
  name: string;
  gender: string;
  language: string;
}

interface NarratorVoiceSectionProps {
  voices: Voice[];
  narratorVoice: string;
  voiceSaving: boolean;
  voiceSuccess: boolean;
  voiceError: string;
  setNarratorVoice: (v: string) => void;
  handleNarratorVoice: () => Promise<void>;
}

export function NarratorVoiceSection({
  voices,
  narratorVoice,
  voiceSaving,
  voiceSuccess,
  voiceError,
  setNarratorVoice,
  handleNarratorVoice,
}: NarratorVoiceSectionProps) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Volume2 className="h-4 w-4 text-text-accent" />
        <h2 className="text-sm font-medium text-text-primary">Narrator Voice</h2>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Choose the voice used for AI narration in story sessions
      </p>
      <div className="flex items-center gap-2">
        <select
          value={narratorVoice}
          onChange={(e) => setNarratorVoice(e.target.value)}
          disabled={voiceSaving}
          className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
        >
          <option value="">No voice</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name || v.id} ({v.gender}, {v.language})
            </option>
          ))}
        </select>
        <button
          onClick={handleNarratorVoice}
          disabled={voiceSaving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {voiceSaving ? (
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </button>
      </div>
      {voiceSuccess && (
        <div className="flex items-center gap-1.5 mt-3 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
          <Check className="h-3.5 w-3.5" />
          Narrator voice saved
        </div>
      )}
      {voiceError && (
        <div className="flex items-center gap-1.5 mt-3 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
          <span>{voiceError}</span>
        </div>
      )}
    </div>
  );
}
