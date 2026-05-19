"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { logger } from "@/lib/logger";

interface Universe {
  id: string;
  name: string;
  group_id: string | null;
}

interface Session {
  id: string;
  name: string;
  type: string;
  group_id: string | null;
  universe_id: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  session_count: number;
  universe_count: number;
}

interface AppUser {
  id: string;
  username: string;
}

interface AppContextType {
  user: AppUser | null;
  activeUniverse: Universe | null;
  universes: Universe[];
  setActiveUniverse: (universe: Universe) => void;
  loading: boolean;
  activeSession: Session | null;
  sessions: Session[];
  setActiveSession: (session: Session | null) => void;
  activeGroup: Group | null;
  groups: Group[];
  setActiveGroup: (group: Group | null) => void;
  refreshAll: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

const ACTIVE_STATE_KEY = "active-app-state";

interface ActiveState {
  groupId: string | null; // null = personal
  sessionId: string | null;
  universeId: string | null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [activeUniverse, setActiveUniverseState] = useState<Universe | null>(null);
  const [activeSession, setActiveSessionState] = useState<Session | null>(null);
  const [activeGroup, setActiveGroupState] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback((): HeadersInit => {
    return {};
  }, []);

  const saveStateToDb = useCallback((updates: Partial<ActiveState>) => {
    const headers: HeadersInit = { "Content-Type": "application/json" };

    // Update localStorage cache immediately
    const current: ActiveState = (() => {
      try {
        const raw = localStorage.getItem(ACTIVE_STATE_KEY);
        return raw ? JSON.parse(raw) : { groupId: null, sessionId: null, universeId: null };
      } catch { return { groupId: null, sessionId: null, universeId: null }; }
    })();
    const merged = { ...current, ...updates };
    localStorage.setItem(ACTIVE_STATE_KEY, JSON.stringify(merged));
    logger.debug('saveStateToDb:', updates, '→ merged:', merged);

    // Sync to DB (fire-and-forget)
    fetch("/api/settings/active-state", {
      method: "PUT",
      headers,
      body: JSON.stringify(updates),
    }).catch((err) => console.warn("[app-context] active state sync failed:", err));
  }, []);

  const loadData = useCallback(() => {
    const headers = authHeaders();

    // Fetch auth state (includes DB-backed active state) + data in parallel
    Promise.all([
      fetch("/api/auth/me", { headers }).then((res) => res.ok ? res.json() : null),
      fetch("/api/universes", { headers }).then((res) => res.ok ? res.json() : { universes: [] }),
      fetch("/api/sessions", { headers }).then((res) => res.ok ? res.json() : { sessions: [] }),
      fetch("/api/groups", { headers }).then((res) => res.ok ? res.json() : { groups: [] }),
    ]).then(([authData, universeData, sessionData, groupData]) => {
      // DB-backed active state from /api/auth/me
      const dbState: ActiveState = authData?.activeState || { groupId: null, sessionId: null, universeId: null };
      logger.debug('DB state:', dbState);

      // Extract user from auth response
      if (authData?.user) {
        setUser({ id: authData.user.id, username: authData.user.username });
      }

      // Sync DB state to localStorage cache
      localStorage.setItem(ACTIVE_STATE_KEY, JSON.stringify(dbState));

      const universeList: Universe[] = (universeData.universes || []).map((u: { id: string; name: string; group_id: string | null }) => ({
        id: u.id,
        name: u.name,
        group_id: u.group_id || null,
      }));

      const sessionList: Session[] = (sessionData.sessions || []).map((s: { id: string; name: string; type: string; group_id: string | null; universe_id: string | null }) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        group_id: s.group_id || null,
        universe_id: s.universe_id || null,
      }));

      const groupList: Group[] = (groupData.groups || []).map((g: { id: string; name: string; description: string | null; member_count: number; session_count: number; universe_count: number }) => ({
        id: g.id,
        name: g.name,
        description: g.description || null,
        member_count: g.member_count || 0,
        session_count: g.session_count || 0,
        universe_count: g.universe_count || 0,
      }));

      // Track what we restore
      let restoredGroup: Group | null = null;
      let restoredSession: Session | null = null;
      let restoredUniverse: Universe | null = null;

      // 1. Restore group context from DB
      if (dbState.groupId) {
        const foundGroup = groupList.find((g: Group) => g.id === dbState.groupId);
        if (foundGroup) {
          setActiveGroupState(foundGroup);
          restoredGroup = foundGroup;
        }
      }

      // 2. Restore session from DB (must match group context)
      if (dbState.sessionId) {
        const foundSession = sessionList.find((s: Session) => s.id === dbState.sessionId);
        if (foundSession && foundSession.group_id === dbState.groupId) {
          setActiveSessionState(foundSession);
          restoredSession = foundSession;
        } else {
          logger.debug('Session not found or group mismatch:', dbState.sessionId);
        }
      }

      // 3. Restore universe from DB (independent of session)
      if (dbState.universeId) {
        const found = universeList.find((u: Universe) => u.id === dbState.universeId);
        if (found && found.group_id === dbState.groupId) {
          setActiveUniverseState(found);
          restoredUniverse = found;
        } else {
          logger.debug('Universe not found or group mismatch:', dbState.universeId);
        }
      }

      // 4. Default: pick first universe matching group context
      if (!restoredUniverse) {
        const matching = universeList.find((u) => u.group_id === dbState.groupId);
        if (matching) setActiveUniverseState(matching);
      }

      // Filter lists to match active group context before setting state
      const activeGroupId = restoredGroup?.id || (dbState.groupId ? dbState.groupId : null);
      const filteredUniverses = universeList.filter((u) => u.group_id === activeGroupId);
      const filteredSessions = sessionList.filter((s) => s.group_id === activeGroupId);

      setUniverses(filteredUniverses);
      setSessions(filteredSessions);
      setGroups(groupList);

      logger.debug('Restore complete:', {
        group: restoredGroup?.name || (dbState.groupId ? 'not found' : 'personal'),
        session: restoredSession?.name || 'none',
        universe: restoredUniverse?.name || 'none',
      });
    }).catch(() => {
      // Fallback: restore from localStorage cache
      try {
        const raw = localStorage.getItem(ACTIVE_STATE_KEY);
        if (raw) {
          const state: ActiveState = JSON.parse(raw);
          if (state.universeId) setActiveUniverseState({ id: state.universeId, name: "Unknown", group_id: null });
        }
      } catch (err) {
        console.warn('[AppProvider] Failed to restore state from DB:', err);
      }
    }).finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => { loadData(); }, [loadData]);

  const setActiveUniverse = useCallback((universe: Universe) => {
    setActiveUniverseState(universe);
    saveStateToDb({ universeId: universe.id });
  }, [saveStateToDb]);

  const setActiveSession = useCallback((session: Session | null) => {
    setActiveSessionState(session);
    if (session) {
      saveStateToDb({ sessionId: session.id });
    } else {
      saveStateToDb({ sessionId: null });
    }
  }, [saveStateToDb]);

  const setActiveGroup = useCallback((group: Group | null) => {
    setActiveGroupState(group);
    saveStateToDb({ groupId: group?.id ?? null, sessionId: null, universeId: null });
    setActiveSessionState(null);
    setActiveUniverseState(null);

    // Filter sessions/universes to match new group context
    const targetGroupId = group?.id || null;
    setSessions((prev) => prev.filter((s) => s.group_id === targetGroupId));
    setUniverses((prev) => prev.filter((u) => u.group_id === targetGroupId));
  }, [saveStateToDb]);

  const refreshAll = useCallback(() => {
    const headers = authHeaders();
    const targetGroupId = activeGroup?.id || null;
    Promise.all([
      fetch("/api/universes", { headers }).then((res) => res.ok ? res.json() : { universes: [] }),
      fetch("/api/sessions", { headers }).then((res) => res.ok ? res.json() : { sessions: [] }),
      fetch("/api/groups", { headers }).then((res) => res.ok ? res.json() : { groups: [] }),
    ]).then(([universeData, sessionData, groupData]) => {
      const universeList = (universeData.universes || []).map((u: { id: string; name: string; group_id: string | null }) => ({
        id: u.id, name: u.name, group_id: u.group_id || null,
      }));
      const sessionList = (sessionData.sessions || []).map((s: { id: string; name: string; type: string; group_id: string | null; universe_id: string | null }) => ({
        id: s.id, name: s.name, type: s.type, group_id: s.group_id || null, universe_id: s.universe_id || null,
      }));
      const groupList = (groupData.groups || []).map((g: { id: string; name: string; description: string | null; member_count: number; session_count: number; universe_count: number }) => ({
        id: g.id, name: g.name, description: g.description || null, member_count: g.member_count || 0, session_count: g.session_count || 0, universe_count: g.universe_count || 0,
      }));

      setGroups(groupList);
      setUniverses(universeList.filter((u: Universe) => u.group_id === targetGroupId));
      setSessions(sessionList.filter((s: Session) => s.group_id === targetGroupId));
    }).catch((err) => console.warn("[app-context] refreshAll fetch failed:", err));
  }, [authHeaders, activeGroup]);

  return (
    <AppContext.Provider value={{
      user, activeUniverse, universes, setActiveUniverse, loading,
      activeSession, sessions, setActiveSession,
      activeGroup, groups, setActiveGroup,
      refreshAll,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
