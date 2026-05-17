/**
 * ConnectionIndicator Component
 *
 * Shows live Ollama and Kokoro TTS connection status in the footer.
 *
 * Usage:
 *   <ConnectionIndicator />
 */

"use client";

import { useState } from "react";
import { Cpu, Volume2, RefreshCw } from "lucide-react";
import { useConnectionStatus } from "@/hooks/use-connection-status";

export function ConnectionIndicator() {
  const { ollama, kokoro, lastChecked, refresh } = useConnectionStatus();
  const [hovering, setHovering] = useState(false);

  function formatTime(ts: number | null): string {
    if (!ts) return "never";
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  }

  return (
    <div
      className="fixed bottom-0 left-56 right-0 z-30 flex items-center justify-between border-t border-border-default bg-bg-elevated/95 px-4 py-1.5 text-xxs backdrop-blur-sm"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex items-center gap-4">
        {/* Ollama status */}
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${
              ollama.status === "connected"
                ? "bg-green-500"
                : ollama.status === "error"
                  ? "bg-red-500"
                  : "bg-yellow-500 animate-pulse"
            }`}
          />
          <Cpu className="h-3 w-3 text-text-muted" />
          <span
            className={
              ollama.status === "connected"
                ? "text-text-secondary"
                : "text-text-muted"
            }
          >
            Ollama{" "}
            {ollama.status === "connected"
              ? `(${ollama.modelCount} models)`
              : ollama.status === "error"
                ? "unavailable"
                : "..."}
          </span>
        </div>

        {/* Kokoro status */}
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${
              kokoro.status === "connected"
                ? "bg-green-500"
                : kokoro.status === "error"
                  ? "bg-red-500"
                  : "bg-yellow-500 animate-pulse"
            }`}
          />
          <Volume2 className="h-3 w-3 text-text-muted" />
          <span
            className={
              kokoro.status === "connected"
                ? "text-text-secondary"
                : "text-text-muted"
            }
          >
            Kokoro{" "}
            {kokoro.status === "connected"
              ? `(${kokoro.voiceCount} voices)`
              : kokoro.status === "error"
                ? "unavailable"
                : "..."}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Last checked */}
        {hovering && (
          <span className="text-text-muted">
            Checked {formatTime(lastChecked)}
          </span>
        )}

        {/* Refresh button */}
        <button
          onClick={refresh}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
          title="Refresh connection status"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
