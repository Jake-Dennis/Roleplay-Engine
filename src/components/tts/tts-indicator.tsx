/**
 * TTSIndicator Component
 *
 * Shows per-message TTS playback status with animated waveform and progress.
 *
 * Usage:
 *   <TTSIndicator isPlaying={true} duration={12000} progress={0.5} onStop={() => stop()} />
 */

"use client";

import { Volume2, Square } from "lucide-react";

interface TTSIndicatorProps {
  isPlaying: boolean;
  duration?: number; // ms
  progress?: number; // 0-1
  onStop: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function TTSIndicator({
  isPlaying,
  duration = 0,
  progress = 0,
  onStop,
}: TTSIndicatorProps) {
  if (!isPlaying) return null;

  const elapsed = duration * progress;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-bg-raised/90 px-2.5 py-1.5 backdrop-blur-sm">
      {/* Animated waveform */}
      <div className="flex items-center gap-0.5">
        <Volume2 className="h-3.5 w-3.5 text-accent animate-pulse" />
        <div className="flex gap-px">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-0.5 rounded-full bg-accent animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1.5">
        <span className="text-xxs text-text-muted">{formatTime(elapsed)}</span>
        <div className="h-1 w-16 rounded-full bg-bg-overlay overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-xxs text-text-muted">{formatTime(duration)}</span>
      </div>

      {/* Stop button */}
      <button
        onClick={onStop}
        className="rounded p-1 text-text-muted hover:text-error"
        title="Stop playback"
      >
        <Square className="h-3 w-3" />
      </button>
    </div>
  );
}
