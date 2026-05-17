/**
 * useConnectionStatus Hook
 *
 * Polls /api/health every 30 seconds to track Ollama and Kokoro TTS connection state.
 *
 * Usage:
 *   const { ollama, kokoro, lastChecked, loading, refresh } = useConnectionStatus();
 */

import { useState, useEffect, useCallback } from "react";

interface ServiceStatus {
  status: "connected" | "unavailable" | "error" | "loading";
  error?: string;
  models?: string[];
  modelCount?: number;
  voices?: string[];
  voiceCount?: number;
}

interface ConnectionStatus {
  ollama: ServiceStatus;
  kokoro: ServiceStatus;
  lastChecked: number | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const LOADING_STATUS: ServiceStatus = { status: "loading" };

export function useConnectionStatus(): ConnectionStatus {
  const [ollama, setOllama] = useState<ServiceStatus>(LOADING_STATUS);
  const [kokoro, setKokoro] = useState<ServiceStatus>(LOADING_STATUS);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOllama(data.ollama || { status: "error" });
      setKokoro(data.kokoro || { status: "error" });
      setLastChecked(Date.now());
    } catch {
      setOllama({ status: "error", error: "Health check failed" });
      setKokoro({ status: "error", error: "Health check failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { ollama, kokoro, lastChecked, loading, refresh: fetchStatus };
}
