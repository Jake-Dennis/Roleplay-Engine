"use client";

import { Settings2, HardDrive, Sparkles, Trash2, Gauge, Save, Check, Link } from "lucide-react";

interface TTSCacheStats {
  totalEntries: number;
  totalDurationMs: number;
  totalUses: number;
  oldestEntry: string | null;
  lastUsed: string | null;
  diskSize: number;
  diskSizeFormatted: string;
  fileCount: number;
}

interface TTSSettingsProps {
  // TTS URL
  ttsUrl: string;
  setTtsUrl: (v: string) => void;
  // TTS Settings state
  ttsSpeed: number;
  setTtsSpeed: (v: number) => void;
  ttsVolume: number;
  setTtsVolume: (v: number) => void;
  ttsFormat: string;
  setTtsFormat: (v: string) => void;
  ttsAutoPlay: boolean;
  setTtsAutoPlay: (v: boolean) => void;
  ttsSkipLong: boolean;
  setTtsSkipLong: (v: boolean) => void;
  ttsLongThreshold: number;
  setTtsLongThreshold: (v: number) => void;
  ttsSaving: boolean;
  ttsSuccess: boolean;
  handleTTSSettings: () => Promise<void>;
  // TTS Cache state
  cacheStats: TTSCacheStats | null;
  cacheLoading: boolean;
  cacheClearing: boolean;
  handleClearCache: (action: string) => Promise<void>;
}

export function TTSSettingsSection({
  ttsUrl, setTtsUrl,
  ttsSpeed, setTtsSpeed,
  ttsVolume, setTtsVolume,
  ttsFormat, setTtsFormat,
  ttsAutoPlay, setTtsAutoPlay,
  ttsSkipLong, setTtsSkipLong,
  ttsLongThreshold, setTtsLongThreshold,
  ttsSaving, ttsSuccess, handleTTSSettings,
  cacheStats, cacheLoading, cacheClearing, handleClearCache,
}: TTSSettingsProps) {
  return (
    <>
      {/* TTS Settings */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Settings2 className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">TTS Settings</h2>
        </div>
        <p className="text-xs text-text-muted mb-3">
          Configure text-to-speech playback preferences
        </p>
        <div className="space-y-4">
          {/* TTS URL */}
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">
              TTS Server URL
              <span className="text-text-muted ml-1">(host:port)</span>
            </label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={ttsUrl}
                onChange={(e) => setTtsUrl(e.target.value)}
                placeholder="e.g. 192.168.4.2:8880"
                className="w-full rounded-lg border border-border-default bg-bg-raised pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
              />
            </div>
            <p className="mt-1 text-xxs text-text-muted">
              Address of your Kokoro TTS server
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Speed: {ttsSpeed.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={ttsSpeed}
              onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xxs text-text-muted">
              <span>0.5x</span>
              <span>2.0x</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Volume: {Math.round(ttsVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={ttsVolume}
              onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xxs text-text-muted">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Format</label>
            <select
              value={ttsFormat}
              onChange={(e) => setTtsFormat(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="ogg">OGG</option>
              <option value="flac">FLAC</option>
            </select>
          </div>

          {/* Auto-play toggle */}
          <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
            <div>
              <p className="text-xs text-text-primary">Auto-play TTS</p>
              <p className="text-xxs text-text-muted">Automatically speak AI responses</p>
            </div>
            <button
              type="button"
              onClick={() => setTtsAutoPlay(!ttsAutoPlay)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                ttsAutoPlay ? "bg-accent" : "bg-bg-highlight"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  ttsAutoPlay ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Skip long messages toggle */}
          <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
            <div>
              <p className="text-xs text-text-primary">Skip long messages</p>
              <p className="text-xxs text-text-muted">Don&apos;t speak messages over {ttsLongThreshold} characters</p>
            </div>
            <button
              type="button"
              onClick={() => setTtsSkipLong(!ttsSkipLong)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                ttsSkipLong ? "bg-accent" : "bg-bg-highlight"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  ttsSkipLong ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {ttsSkipLong && (
            <div>
              <label className="mb-1 block text-xs text-text-secondary">
                Skip threshold: {ttsLongThreshold} chars
              </label>
              <input
                type="range"
                min="200"
                max="1000"
                step="50"
                value={ttsLongThreshold}
                onChange={(e) => setTtsLongThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xxs text-text-muted">
                <span>200</span>
                <span>1000</span>
              </div>
            </div>
          )}

          <button
            onClick={handleTTSSettings}
            disabled={ttsSaving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {ttsSaving ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save TTS Settings
          </button>
          {ttsSuccess && (
            <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              TTS settings saved
            </div>
          )}
        </div>
      </div>

      {/* TTS Cache Management */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <HardDrive className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">TTS Cache</h2>
        </div>

        {cacheLoading ? (
          <div className="flex items-center gap-2 text-text-muted">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span className="text-xs">Loading cache stats...</span>
          </div>
        ) : cacheStats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-bg-raised px-3.5 py-2.5 text-center">
                <p className="text-lg font-semibold text-text-primary">{cacheStats.totalEntries}</p>
                <p className="text-xxs text-text-muted">Entries</p>
              </div>
              <div className="rounded-lg bg-bg-raised px-3.5 py-2.5 text-center">
                <p className="text-lg font-semibold text-text-primary">{cacheStats.diskSizeFormatted}</p>
                <p className="text-xxs text-text-muted">Disk Size</p>
              </div>
              <div className="rounded-lg bg-bg-raised px-3.5 py-2.5 text-center">
                <p className="text-lg font-semibold text-text-primary">{cacheStats.totalUses}</p>
                <p className="text-xxs text-text-muted">Total Uses</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-xs text-text-muted">
                {cacheStats.totalDurationMs > 0
                  ? `${(cacheStats.totalDurationMs / 1000 / 60).toFixed(1)} min of audio cached`
                  : "No audio cached"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearCache("expired")}
                disabled={cacheClearing}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-overlay disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Expired
              </button>
              <button
                onClick={() => handleClearCache("unused")}
                disabled={cacheClearing}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-overlay disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Unused
              </button>
              <button
                onClick={() => handleClearCache("clear")}
                disabled={cacheClearing}
                className="flex items-center gap-1.5 rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error hover:bg-error/20 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Unable to load cache stats</p>
        )}
      </div>
    </>
  );
}
