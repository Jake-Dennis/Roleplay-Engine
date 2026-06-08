"use client";

import { Check, Cpu, RefreshCw, Volume2, Wifi, WifiOff } from "lucide-react";

interface ConnectionStatus {
  status: string;
  modelCount?: number;
  voiceCount?: number;
  error?: string;
}

interface ConnectionStatusSectionProps {
  connOllama: ConnectionStatus;
  connKokoro: ConnectionStatus;
  connLoading: boolean;
  handleRefreshConnections: () => Promise<void>;
}

export function ConnectionStatusSection({
  connOllama,
  connKokoro,
  connLoading,
  handleRefreshConnections,
}: ConnectionStatusSectionProps) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Wifi className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Connection Status</h2>
        </div>
        <button
          onClick={handleRefreshConnections}
          disabled={connLoading}
          className="flex items-center gap-1 rounded-lg bg-bg-raised px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${connLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {/* Ollama */}
        <div className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 ${
          connOllama.status === "connected" ? "bg-success/10" : "bg-bg-raised"
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`h-2.5 w-2.5 rounded-full ${
              connOllama.status === "connected" ? "bg-green-500" : "bg-red-500"
            }`} />
            <Cpu className="h-4 w-4 text-text-muted" />
            <div>
              <p className="text-xs text-text-primary">Ollama</p>
              <p className="text-xxs text-text-muted">
                {connOllama.status === "connected"
                  ? `${connOllama.modelCount} models available`
                  : connOllama.error || "Unavailable"}
              </p>
            </div>
          </div>
          {connOllama.status === "connected" ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
        </div>

        {/* Kokoro */}
        <div className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 ${
          connKokoro.status === "connected" ? "bg-success/10" : "bg-bg-raised"
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`h-2.5 w-2.5 rounded-full ${
              connKokoro.status === "connected" ? "bg-green-500" : "bg-red-500"
            }`} />
            <Volume2 className="h-4 w-4 text-text-muted" />
            <div>
              <p className="text-xs text-text-primary">Kokoro TTS</p>
              <p className="text-xxs text-text-muted">
                {connKokoro.status === "connected"
                  ? `${connKokoro.voiceCount} voices available`
                  : connKokoro.error || "Unavailable"}
              </p>
            </div>
          </div>
          {connKokoro.status === "connected" ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
        </div>
      </div>
    </div>
  );
}
