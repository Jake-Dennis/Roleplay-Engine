/**
 * useSession Hook
 *
 * Manages session state including participants, turn management, and SSE connection.
 *
 * Usage:
 *   const { session, messages, sceneState, participants, turnConfig, isOwner, claimTurn, advanceTurn, refresh } = useSession(sessionId);
 */

import { useState, useEffect, useCallback } from "react";

interface Participant {
  id: string;
  username: string;
  role: string;
  character_name: string | null;
  joined_at: string;
}

interface TurnConfig {
  turnMode: string;
  turnOrder: string[];
  currentTurn: string | null;
}

interface Session {
  id: string;
  name: string;
  owner_id: string;
  universe_id: string | null;
  group_id: string | null;
  status: string;
  type: string;
  personaId: string | null;
}

export interface Message {
  id: string;
  session_id: string;
  sender_id: string | null;
  content: string;
  timestamp: string;
  sender_name: string | null;
  persona_name: string | null;
  persona_avatar: string | null;
}

interface SceneState {
  id: string;
  session_id: string;
  active_location_id: string | null;
  current_goal: string | null;
  emotional_tone: string | null;
  active_npcs: string | null;
  active_threads: string | null;
  scene_summary: string | null;
  updated_at: string;
}

interface UseSessionResult {
  session: Session | null;
  messages: Message[];
  sceneState: SceneState | null;
  participants: Participant[];
  turnConfig: TurnConfig | null;
  isOwner: boolean;
  isObserver: boolean;
  loading: boolean;
  error: string | null;
  claimTurn: () => Promise<boolean>;
  advanceTurn: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useSession(sessionId: string): UseSessionResult {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sceneState, setSceneState] = useState<SceneState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [turnConfig, setTurnConfig] = useState<TurnConfig | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isObserver, setIsObserver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      // Browser automatically sends httpOnly cookies with same-origin requests
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const data = await res.json();
      setSession(data.session || null);
      setMessages(data.messages || []);
      setSceneState(data.sceneState || null);
      setParticipants(data.participants || []);
      setTurnConfig(data.turnConfig || null);
      setIsOwner(data.isOwner || false);
      // Check if current user is an observer
      const currentUserParticipant = (data.participants || []).find(
        (p: Participant) => p.role === "observer"
      );
      setIsObserver(!!currentUserParticipant);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSession(null);
      setMessages([]);
      setSceneState(null);
      setParticipants([]);
      setTurnConfig(null);
      setIsOwner(false);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const claimTurn = useCallback(async () => {
    if (!sessionId) return false;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.turnConfig) setTurnConfig(data.turnConfig);
      return true;
    } catch {
      return false;
    }
  }, [sessionId]);

  const advanceTurn = useCallback(async () => {
    if (!sessionId) return false;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.turnConfig) setTurnConfig(data.turnConfig);
      return true;
    } catch {
      return false;
    }
  }, [sessionId]);

  return {
    session,
    messages,
    sceneState,
    participants,
    turnConfig,
    isOwner,
    isObserver,
    loading,
    error,
    claimTurn,
    advanceTurn,
    refresh,
  };
}
