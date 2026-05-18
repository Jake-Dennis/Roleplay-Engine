"use client";

import { useApp, AppProvider } from "@/contexts/app-context";

// Compatibility shim: re-export AppProvider so old imports still work
export { AppProvider as ActiveUniverseProvider };

// Compatibility shim: map useApp() to the old useActiveUniverse() shape
export function useActiveUniverse() {
  const app = useApp();

  return {
    activeUniverse: app.activeUniverse,
    universes: app.universes,
    setActiveUniverse: app.setActiveUniverse,
    loading: app.loading,
    sessionUniverse: app.activeSession
      ? app.universes.find((u) => u.id === app.activeSession!.universe_id) || null
      : null,
    activeSession: app.activeSession,
    sessions: app.sessions,
    setActiveSession: app.setActiveSession,
    refreshSessions: app.refreshAll,
  };
}
