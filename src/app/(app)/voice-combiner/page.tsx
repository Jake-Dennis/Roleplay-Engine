"use client";

import { useEffect, useState, useCallback } from "react";
import { Volume2, Plus, Trash2, Play, Save, Sparkles, Check, Mic } from "lucide-react";
import { useActiveUniverse } from "@/contexts/active-universe";

interface Voice {
  id: string;
  name: string;
  gender: string;
  language: string;
}

interface VoiceSlot {
  voiceId: string;
  weight: number;
}

interface SavedProfile {
  id: string;
  name: string;
  slots: VoiceSlot[];
}

function getStorageKey(universeId: string | null): string {
  return universeId ? `voice-profiles-${universeId}` : "voice-profiles";
}

export default function VoiceCombinerPage() {
  const { activeUniverse } = useActiveUniverse();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [slots, setSlots] = useState<VoiceSlot[]>([{ voiceId: "", weight: 50 }]);
  const [profileName, setProfileName] = useState("");
  const [previewText, setPreviewText] = useState("The story begins in a quiet village at the edge of the world.");
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Load voices and profiles
  useEffect(() => {
    fetch("/api/tts/voices")
      .then((res) => res.json())
      .then((data) => {
        setVoices(data.voiceDetails || []);
      })
      .catch((err) => console.warn("[voice-combiner] voices fetch failed:", err));
  }, []);

  // Load profiles when universe changes
  useEffect(() => {
    setLoadingProfiles(true);
    try {
      const stored = localStorage.getItem(getStorageKey(activeUniverse?.id || null));
      if (stored) {
        setSavedProfiles(JSON.parse(stored));
      } else {
        setSavedProfiles([]);
      }
    } catch {
      setSavedProfiles([]);
    } finally {
      setLoadingProfiles(false);
    }
    // Reset form on universe switch
    setProfileName("");
    setSlots([{ voiceId: "", weight: 50 }]);
  }, [activeUniverse?.id]);

  const totalWeight = slots.reduce((sum, s) => sum + s.weight, 0);

  function addSlot() {
    if (slots.length >= 4) return;
    setSlots((prev) => [...prev, { voiceId: "", weight: 50 }]);
  }

  function removeSlot(index: number) {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlot(index: number, field: keyof VoiceSlot, value: string | number) {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function normalizeWeights() {
    if (totalWeight === 0) return;
    setSlots((prev) =>
      prev.map((s) => ({ ...s, weight: Math.round((s.weight / totalWeight) * 100) }))
    );
  }

  async function handlePreview() {
    const activeSlots = slots.filter((s) => s.voiceId);
    if (activeSlots.length === 0) {
      setError("Select at least one voice");
      return;
    }
    if (!previewText.trim()) {
      setError("Enter preview text");
      return;
    }

    setPlaying(true);
    setError(null);

    try {
      // Generate with the primary voice (highest weight)
      const primary = activeSlots.reduce((a, b) => (a.weight > b.weight ? a : b));
      const voice = voices.find((v) => v.id === primary.voiceId);
      if (!voice) {
        setError("Voice not found");
        return;
      }

      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: previewText,
          voice: voice.id,
          speed: 1.0,
          format: "mp3",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Generation failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlaying(false);
        setError("Playback failed");
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setError("Connection failed");
      setPlaying(false);
    }
  }

  async function handleSave() {
    if (!profileName.trim()) {
      setError("Enter a profile name");
      return;
    }
    const activeSlots = slots.filter((s) => s.voiceId);
    if (activeSlots.length === 0) {
      setError("Select at least one voice");
      return;
    }

    setSaving(true);
    setError(null);

    const profile: SavedProfile = {
      id: crypto.randomUUID(),
      name: profileName.trim(),
      slots: activeSlots,
    };

    try {
      const updated = [...savedProfiles, profile];
      setSavedProfiles(updated);
      localStorage.setItem(getStorageKey(activeUniverse?.id || null), JSON.stringify(updated));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setProfileName("");
      setSlots([{ voiceId: "", weight: 50 }]);
    } finally {
      setSaving(false);
    }
  }

  function loadProfile(profile: SavedProfile) {
    setProfileName(profile.name);
    setSlots(profile.slots.length > 0 ? profile.slots : [{ voiceId: "", weight: 50 }]);
  }

  function deleteProfile(id: string) {
    const updated = savedProfiles.filter((p) => p.id !== id);
    setSavedProfiles(updated);
    localStorage.setItem(getStorageKey(activeUniverse?.id || null), JSON.stringify(updated));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold text-text-primary">Voice Combiner</h1>
        <p className="mt-1 text-xs text-text-muted">
          Mix multiple voices to create unique narration
          {activeUniverse && <span className="ml-1 text-text-accent">· {activeUniverse.name}</span>}
        </p>
      </div>

      {/* Voice Slots */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Mic className="h-4 w-4 text-text-accent" />
            <h2 className="text-sm font-medium text-text-primary">Voice Mix</h2>
          </div>
          <span className="text-xxs text-text-muted">
            Total: {totalWeight}%
          </span>
        </div>

        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-3">
              <select
                value={slot.voiceId}
                onChange={(e) => updateSlot(i, "voiceId", e.target.value)}
                className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
              >
                <option value="">Select voice...</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name || v.id} ({v.gender}, {v.language})
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 w-32">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={slot.weight}
                  onChange={(e) => updateSlot(i, "weight", parseInt(e.target.value))}
                  className="flex-1 accent-accent"
                />
                <span className="w-8 text-right text-xs text-text-muted">{slot.weight}%</span>
              </div>
              {slots.length > 1 && (
                <button
                  onClick={() => removeSlot(i)}
                  className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-error"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {slots.length < 4 && (
          <button
            onClick={addSlot}
            className="mt-3 flex items-center gap-1.5 text-xs text-text-accent hover:text-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Voice
          </button>
        )}

        {totalWeight !== 100 && totalWeight > 0 && (
          <button
            onClick={normalizeWeights}
            className="mt-2 text-xxs text-text-muted hover:text-text-primary"
          >
            Normalize to 100%
          </button>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <Volume2 className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Preview</h2>
        </div>
        <textarea
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none"
          placeholder="Enter text to preview the combined voice..."
        />
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handlePreview}
            disabled={playing}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {playing ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {playing ? "Playing..." : "Preview"}
          </button>
        </div>
      </div>

      {/* Save Profile */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <Save className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Save Profile</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Profile name..."
            className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>

      {/* Saved Profiles */}
      {!loadingProfiles && savedProfiles.length > 0 && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-3">Saved Profiles</h2>
          <div className="space-y-2">
            {savedProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between rounded-lg bg-bg-raised px-3.5 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{profile.name}</p>
                  <p className="text-xxs text-text-muted">
                    {profile.slots
                      .map((s) => {
                        const v = voices.find((v) => v.id === s.voiceId);
                        return v ? `${v.name || v.id} (${s.weight}%)` : s.voiceId;
                      })
                      .join(" + ")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => loadProfile(profile)}
                    className="rounded-lg border border-border-default px-2.5 py-1.5 text-xxs font-medium text-text-muted hover:text-text-primary"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteProfile(profile.id)}
                    className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
          <Check className="h-3.5 w-3.5" />
          Profile saved
        </div>
      )}
    </div>
  );
}
