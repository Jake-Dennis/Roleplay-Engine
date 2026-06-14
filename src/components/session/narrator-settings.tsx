"use client";

import { useState, useEffect } from "react";
import { ScrollText, Save, Check } from "lucide-react";

interface NarratorOptions {
  perspective: string;
  pacing: string;
  npcVoices: string;
  style: string;
}

interface NarratorSettingsProps {
  sessionId: string;
}

export function NarratorSettings({ sessionId }: NarratorSettingsProps) {
  const [options, setOptions] = useState<NarratorOptions>({
    perspective: "",
    pacing: "",
    npcVoices: "",
    style: "",
  });
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/config`)
      .then(r => r.json())
      .then(data => {
        if (data.config) {
          setOptions({
            perspective: data.config.narrator_perspective || "",
            pacing: data.config.narrator_pacing || "",
            npcVoices: data.config.narrator_npc_voices || "",
            style: data.config.narrator_style || "",
          });
        }
      })
      .catch(() => {});
  }, [sessionId]);

  const save = async () => {
    await fetch(`/api/sessions/${sessionId}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        narrator_perspective: options.perspective || null,
        narrator_pacing: options.pacing || null,
        narrator_npc_voices: options.npcVoices || null,
        narrator_style: options.style || null,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <ScrollText className="h-4 w-4 text-text-secondary" />
        <span className="text-sm font-medium text-text-primary">Narrator Style</span>
        <span className="text-xxs text-text-muted ml-auto">
          {expanded ? "Collapse" : "Expand"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xxs text-text-muted block mb-1">Perspective</label>
            <select
              value={options.perspective}
              onChange={e => setOptions(o => ({ ...o, perspective: e.target.value }))}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
            >
              <option value="">Second person ("You step into the tavern...")</option>
              <option value="first">First person ("I push open the door...")</option>
              <option value="third">Third person ("The traveler entered the inn...")</option>
            </select>
            <p className="text-xxs text-text-muted mt-1">
              {options.perspective === "first"
                ? "Narrator speaks as the character — less common for roleplay"
                : options.perspective === "third"
                ? "Outside observer — reads like a novel"
                : "Most immersive — puts you in the scene"}
            </p>
          </div>

          <div>
            <label className="text-xxs text-text-muted block mb-1">Pacing</label>
            <select
              value={options.pacing}
              onChange={e => setOptions(o => ({ ...o, pacing: e.target.value }))}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
            >
              <option value="">Balanced — steady narrative flow</option>
              <option value="brisk">Brisk — moves quickly, minimal description</option>
              <option value="slow">Slow — rich, detailed, atmospheric</option>
            </select>
            <p className="text-xxs text-text-muted mt-1">
              {options.pacing === "brisk"
                ? "Scene advances fast — good for action or dialogue-heavy moments"
                : options.pacing === "slow"
                ? "Lets the scene breathe — good for exploration or tense atmospheres"
                : "Natural mix of action and description"}
            </p>
          </div>

          <div>
            <label className="text-xxs text-text-muted block mb-1">NPC Voices</label>
            <select
              value={options.npcVoices}
              onChange={e => setOptions(o => ({ ...o, npcVoices: e.target.value }))}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
            >
              <option value="">Full — distinct personalities</option>
              <option value="minimal">Minimal — brief and functional</option>
              <option value="distinct">Distinct — each NPC unique</option>
            </select>
            <p className="text-xxs text-text-muted mt-1">
              {options.npcVoices === "minimal"
                ? "NPCs are functional — quick responses, less dialogue focus"
                : options.npcVoices === "distinct"
                ? "Every NPC has unique speech patterns and mannerisms"
                : "NPCs feel alive with their own personalities"}
            </p>
          </div>

          <div>
            <label className="text-xxs text-text-muted block mb-1">Custom Style Instructions</label>
            <textarea
              value={options.style}
              onChange={e => setOptions(o => ({ ...o, style: e.target.value }))}
              placeholder="e.g. Emphasize atmospheric weather, focus on dialogue, dark and gritty tone..."
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary resize-none"
              rows={2}
            />
          </div>

          <button
            onClick={save}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xxs text-white hover:bg-accent-hover"
          >
            {saved ? (
              <><Check className="h-3 w-3" /> Saved</>
            ) : (
              <><Save className="h-3 w-3" /> Save Style</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
