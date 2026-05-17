/**
 * VoicePicker Component
 *
 * Dropdown for selecting TTS voices with preview and metadata.
 *
 * Usage:
 *   <VoicePicker
 *     voices={voices}
 *     selectedVoice={selectedVoice}
 *     onSelect={(voice) => setSelectedVoice(voice)}
 *     onPreview={(voice) => preview(voice)}
 *   />
 */

"use client";

import { useState } from "react";
import { Volume2, Check, ChevronDown, Loader2 } from "lucide-react";

interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  quality?: string;
}

interface VoicePickerProps {
  voices: Voice[];
  selectedVoice: string | null;
  onSelect: (voiceId: string) => void;
  onPreview?: (voiceId: string) => void;
  loading?: boolean;
}

export function VoicePicker({
  voices,
  selectedVoice,
  onSelect,
  onPreview,
  loading = false,
}: VoicePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selected = voices.find((v) => v.id === selectedVoice);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex w-full items-center justify-between rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary hover:bg-bg-elevated disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center gap-2 text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading voices...
          </span>
        ) : selected ? (
          <span>{selected.name}</span>
        ) : (
          <span className="text-text-muted">Select a voice...</span>
        )}
        <ChevronDown className="h-4 w-4 text-text-muted" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-border-default bg-bg-elevated shadow-xl max-h-64 overflow-auto">
            {voices.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-muted">
                No voices available
              </div>
            ) : (
              voices.map((voice) => {
                const isSelected = voice.id === selectedVoice;
                return (
                  <div
                    key={voice.id}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-bg-raised ${
                      isSelected ? "bg-accent/10" : ""
                    }`}
                    onClick={() => {
                      onSelect(voice.id);
                      setIsOpen(false);
                    }}
                  >
                    <div>
                      <p className="text-sm text-text-primary">{voice.name}</p>
                      <p className="text-xxs text-text-muted">
                        {voice.language}
                        {voice.gender ? ` · ${voice.gender}` : ""}
                        {voice.quality ? ` · ${voice.quality}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {onPreview && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreview(voice.id);
                          }}
                          className="rounded p-1 text-text-muted hover:text-accent"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isSelected && (
                        <Check className="h-4 w-4 text-accent" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
