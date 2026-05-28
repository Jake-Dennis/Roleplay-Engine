/**
 * useVoices Hook
 *
 * Manages TTS voice list, discovery, and per-entity voice assignments.
 *
 * Usage:
 *   const { voices, loading, assignVoice, getVoice, refresh } = useVoices();
 */

import { useState, useEffect, useCallback } from "react";

interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: string;
}

interface VoiceAssignment {
  voice_name: string;
  voice_speed: number;
  volume: number;
}

interface UseVoicesResult {
  voices: VoiceInfo[];
  loading: boolean;
  error: string | null;
  assignVoice: (entityType: string, entityId: string, voiceName: string, speed?: number, volume?: number) => Promise<boolean>;
  getVoice: (entityType: string, entityId: string) => Promise<VoiceAssignment | null>;
  removeVoice: (entityType: string, entityId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useVoices(): UseVoicesResult {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tts/voices");
      if (!res.ok) throw new Error(`Failed to load voices: ${res.status}`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setVoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/tts/voices");
        if (!res.ok) throw new Error(`Failed to load voices: ${res.status}`);
        const data = await res.json();
        setVoices(data.voices || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setVoices([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const assignVoice = useCallback(async (
    entityType: string,
    entityId: string,
    voiceName: string,
    speed = 1.0,
    volume = 0.8
  ) => {
    try {
      const res = await fetch("/api/voice-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, voiceName, speed, volume }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const getVoice = useCallback(async (
    entityType: string,
    entityId: string
  ): Promise<VoiceAssignment | null> => {
    try {
      const res = await fetch(`/api/voice-assignments?entityType=${entityType}&entityId=${entityId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.assignment || null;
    } catch {
      return null;
    }
  }, []);

  const removeVoice = useCallback(async (
    entityType: string,
    entityId: string
  ) => {
    try {
      const res = await fetch(`/api/voice-assignments?entityType=${entityType}&entityId=${entityId}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    voices,
    loading,
    error,
    assignVoice,
    getVoice,
    removeVoice,
    refresh,
  };
}
