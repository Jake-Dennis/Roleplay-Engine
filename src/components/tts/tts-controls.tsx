/**
 * TTSControls Component
 *
 * Playback controls for TTS audio with play/pause, speed, and volume.
 *
 * Usage:
 *   <TTSControls
 *     isPlaying={isPlaying}
 *     onPlay={() => play()}
 *     onPause={() => pause()}
 *     speed={speed}
 *     onSpeedChange={(s) => setSpeed(s)}
 *     volume={volume}
 *     onVolumeChange={(v) => setVolume(v)}
 *   />
 */

"use client";

import { Play, Pause, SkipBack, SkipForward, Volume2, Volume1, VolumeX } from "lucide-react";

interface TTSControlsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function VolumeIcon({ volume }: { volume: number }) {
  if (volume === 0) return <VolumeX className="h-4 w-4" />;
  if (volume < 0.5) return <Volume1 className="h-4 w-4" />;
  return <Volume2 className="h-4 w-4" />;
}

export function TTSControls({
  isPlaying,
  onPlay,
  onPause,
  speed,
  onSpeedChange,
  volume,
  onVolumeChange,
  hasNext = false,
  hasPrev = false,
  onNext,
  onPrev,
}: TTSControlsProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-elevated px-4 py-3">
      {/* Playback controls */}
      <div className="flex items-center gap-1">
        {hasPrev && onPrev && (
          <button
            onClick={onPrev}
            className="rounded p-1.5 text-text-muted hover:text-text-primary disabled:opacity-30"
            disabled={!hasPrev}
          >
            <SkipBack className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </button>
        {hasNext && onNext && (
          <button
            onClick={onNext}
            className="rounded p-1.5 text-text-muted hover:text-text-primary disabled:opacity-30"
            disabled={!hasNext}
          >
            <SkipForward className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-1">
        <span className="text-xxs text-text-muted w-8">Speed</span>
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="rounded-lg border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary"
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>

      {/* Volume slider */}
      <div className="flex items-center gap-2">
        <VolumeIcon volume={volume} />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="h-1 w-20 accent-accent"
        />
      </div>
    </div>
  );
}
