"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface Universe {
  id: string;
  name: string;
}

interface ActiveUniverseContextType {
  activeUniverse: Universe | null;
  universes: Universe[];
  setActiveUniverse: (universe: Universe) => void;
  loading: boolean;
}

const ActiveUniverseContext = createContext<ActiveUniverseContextType | null>(null);

const STORAGE_KEY = "active-universe-id";

export function ActiveUniverseProvider({ children }: { children: ReactNode }) {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [activeUniverse, setActiveUniverseState] = useState<Universe | null>(null);
  const [loading, setLoading] = useState(true);

  // Load universes on mount
  useEffect(() => {
    fetch("/api/universes")
      .then((res) => res.ok ? res.json() : { universes: [] })
      .then((data) => {
        const list: Universe[] = (data.universes || []).map((u: { id: string; name: string }) => ({
          id: u.id,
          name: u.name,
        }));
        setUniverses(list);

        // Restore active universe from localStorage
        const storedId = localStorage.getItem(STORAGE_KEY);
        if (storedId) {
          const found = list.find((u: Universe) => u.id === storedId);
          if (found) {
            setActiveUniverseState(found);
          } else if (list.length > 0) {
            setActiveUniverseState(list[0]);
            localStorage.setItem(STORAGE_KEY, list[0].id);
          }
        } else if (list.length > 0) {
          setActiveUniverseState(list[0]);
          localStorage.setItem(STORAGE_KEY, list[0].id);
        }
      })
      .catch(() => {
        // If fetch fails, still try to restore from localStorage
        const storedId = localStorage.getItem(STORAGE_KEY);
        if (storedId) {
          setActiveUniverseState({ id: storedId, name: "Unknown" });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const setActiveUniverse = useCallback((universe: Universe) => {
    setActiveUniverseState(universe);
    localStorage.setItem(STORAGE_KEY, universe.id);
  }, []);

  return (
    <ActiveUniverseContext.Provider value={{ activeUniverse, universes, setActiveUniverse, loading }}>
      {children}
    </ActiveUniverseContext.Provider>
  );
}

export function useActiveUniverse() {
  const context = useContext(ActiveUniverseContext);
  if (!context) {
    throw new Error("useActiveUniverse must be used within ActiveUniverseProvider");
  }
  return context;
}
