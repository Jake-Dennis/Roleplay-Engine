"use client";

import { HardDrive, Sparkles, Trash2, Gauge, Link } from "lucide-react";

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
  ttsSaving, ttsSuccess, handleTTSSettings,
  cacheStats, cacheLoading, cacheClearing, handleClearCache,
}: TTSSettingsProps) {
  return (
    <>
      {/* TTS Server URL */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Link className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">TTS Server</h2>
        </div>
        <p className="text-xs text-text-muted mb-3">
          Address of your Kokoro TTS server. Playback preferences are per-user in User Settings.
        </p>
        <div className="space-y-4">
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
          </div>

          <button
            onClick={handleTTSSettings}
            disabled={ttsSaving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {ttsSaving ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Save
          </button>
          {ttsSuccess && (
            <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              <Sparkles className="h-3.5 w-3.5" />
              TTS server URL saved
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
                <p className="text-xxs text-text-muted">Disk</p>
              </div>
              <div className="rounded-lg bg-bg-raised px-3.5 py-2.5 text-center">
                <p className="text-lg font-semibold text-text-primary">{cacheStats.totalUses}</p>
                <p className="text-xxs text-text-muted">Uses</p>
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
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-elevated disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Expired
              </button>
              <button
                onClick={() => handleClearCache("unused")}
                disabled={cacheClearing}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-elevated disabled:opacity-50"
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
