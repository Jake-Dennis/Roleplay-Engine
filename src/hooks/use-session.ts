/**
 * useSession Hook
 *
 * Manages session state including participants, turn management, and SSE connection.
 * State is consolidated into a single `SessionState` object accessed via `state.*`.
 *
 * Usage:
 *   const { state, claimTurn, advanceTurn, refresh } = useSession(sessionId);
 *   // Access: state.session, state.messages, state.sceneState, etc.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface Participant {
  id: string;
  username: string;
  role: string;
  character_name: string | null;
  entity_id: string | null;
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
  sessionId: string;
  senderId: string | null;
  content: string;
  timestamp: string;
  senderName: string | null;
  personaName: string | null;
  personaAvatar: string | null;
}

interface SceneState {
  id: string;
  session_id: string;
  active_location_id: string | null;
  current_goal: string | null;
  emotional_tone: string | null;
  active_npcs: string | null;
  active_npc_ids: string | null;
  active_threads: string | null;
  scene_summary: string | null;
  updated_at: string;
}

export interface SessionState {
  session: Session | null;
  messages: Message[];
  sceneState: SceneState | null;
  participants: Participant[];
  turnConfig: TurnConfig | null;
  isOwner: boolean;
  isObserver: boolean;
  loading: boolean;
  error: string | null;
}

interface UseSessionResult {
  state: SessionState;
  claimTurn: () => Promise<boolean>;
  advanceTurn: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const INITIAL_STATE: SessionState = {
  session: null,
  messages: [],
  sceneState: null,
  participants: [],
  turnConfig: null,
  isOwner: false,
  isObserver: false,
  loading: true,
  error: null,
};

export function useSession(sessionId: string): UseSessionResult {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const pending = useRef(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    if (pending.current) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    pending.current = true;
    try {
      // Browser automatically sends httpOnly cookies with same-origin requests
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const data = await res.json();
      // Check if current user is an observer
      const currentUserParticipant = (data.participants || []).find(
        (p: Participant) => p.role === "observer"
      );
      setState({
        session: data.session || null,
        messages: data.messages || [],
        sceneState: data.sceneState || null,
        participants: data.participants || [],
        turnConfig: data.turnConfig || null,
        isOwner: data.isOwner || false,
        isObserver: !!currentUserParticipant,
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      setState({
        ...INITIAL_STATE,
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      pending.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    (async () => {
      if (!sessionId) return;
      if (pending.current) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      pending.current = true;
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
        const data = await res.json();
        const currentUserParticipant = (data.participants || []).find(
          (p: Participant) => p.role === "observer"
        );
        setState({
          session: data.session || null,
          messages: data.messages || [],
          sceneState: data.sceneState || null,
          participants: data.participants || [],
          turnConfig: data.turnConfig || null,
          isOwner: data.isOwner || false,
          isObserver: !!currentUserParticipant,
          loading: false,
          error: null,
        });
      } catch (err: unknown) {
        setState({
          ...INITIAL_STATE,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        pending.current = false;
      }
    })();
  }, [sessionId]);

  // SSE subscription for real-time scene updates
  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);

    eventSource.addEventListener("scene:updated", () => {
      // The SSE payload carries only the sessionId; the scene state has
      // already been persisted to DB by scene-handler. A refresh fetches
      // the latest session data including sceneState via setSceneState().
      refresh();
    });

    eventSource.onerror = () => {
      // EventSource auto-reconnects by default
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, refresh]);

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
      if (data.turnConfig) {
        setState((prev) => ({ ...prev, turnConfig: data.turnConfig }));
      }
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
      if (data.turnConfig) {
        setState((prev) => ({ ...prev, turnConfig: data.turnConfig }));
      }
      return true;
    } catch {
      return false;
    }
  }, [sessionId]);

  return {
    state,
    claimTurn,
    advanceTurn,
    refresh,
  };
}
