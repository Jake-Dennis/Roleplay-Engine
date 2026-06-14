"use client";

import { useState, useEffect, useRef } from "react";
import { ScrollText, Check } from "lucide-react";

interface NarratorOptions {
  perspective: string;
  pacing: string;
  npcVoices: string;
  style: string;
}

export function NarratorStyleInline({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<NarratorOptions>({ perspective: "", pacing: "", npcVoices: "", style: "" });
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  const save = async (key: string, val: string) => {
    setOptions(o => ({ ...o, [key]: val }));
    await fetch(`/api/sessions/${sessionId}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [`narrator_${key}`]: val || null }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded p-1 transition-colors hover:bg-bg-raised ${open ? "text-accent" : "text-text-muted hover:text-accent"}`}
        title="Narrator Style"
      >
        <ScrollText className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border-default bg-bg-elevated shadow-lg z-10 p-3 space-y-2">
          <div>
            <label className="text-xxs text-text-muted block mb-0.5">Perspective</label>
            <select value={options.perspective} onChange={e => save("perspective", e.target.value)} className="w-full rounded border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary">
              <option value="">Second person</option>
              <option value="first">First person</option>
              <option value="third">Third person</option>
            </select>
          </div>
          <div>
            <label className="text-xxs text-text-muted block mb-0.5">Pacing</label>
            <select value={options.pacing} onChange={e => save("pacing", e.target.value)} className="w-full rounded border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary">
              <option value="">Balanced</option>
              <option value="brisk">Brisk</option>
              <option value="slow">Slow</option>
            </select>
          </div>
          <div>
            <label className="text-xxs text-text-muted block mb-0.5">NPC Voices</label>
            <select value={options.npcVoices} onChange={e => save("npcVoices", e.target.value)} className="w-full rounded border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary">
              <option value="">Full</option>
              <option value="minimal">Minimal</option>
              <option value="distinct">Distinct</option>
            </select>
          </div>
          {saved && (
            <div className="flex items-center gap-1 text-xxs text-status-success">
              <Check className="h-3 w-3" /> Saved
            </div>
          )}
        </div>
      )}
    </div>
  );
}
