/**
 * @deprecated This file is not currently imported by any source module.
 * Kept for reference. Will be removed in a future cleanup pass once
 * all consumers are verified.
 * @reason Generic localStorage hook has no consumers. Settings and
 * preferences are managed through the server-side settings API or
 * React state rather than localStorage.
 */

/**
 * useLocalStorage Hook
 *
 * Persistent client-side settings with automatic JSON serialization.
 * Used in settings, voice-combiner, and FPS counter.
 *
 * Usage:
 *   const [value, setValue] = useLocalStorage("tts-speed", 1.0);
 */

import { useState, useEffect, useCallback } from "react";
import { safeParse } from "@/lib/safe-json";

export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (safeParse(stored) ?? defaultValue) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable
    }
  }, [key, value]);

  const setStoredValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = newValue instanceof Function ? newValue(prev) : newValue;
        return resolved;
      });
    },
    []
  );

  return [value, setStoredValue];
}
