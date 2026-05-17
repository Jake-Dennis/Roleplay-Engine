"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface IdleConfig {
  /** How often to check idle state and send heartbeat (ms). Default: 30000 */
  heartbeatInterval?: number;
  /** Idle thresholds in ms: [5min, 10min, 15min, 30min]. Default: [300000, 600000, 900000, 1800000] */
  idleThresholds?: number[];
}

/**
 * Tracks user activity (mouse, keyboard, scroll, touch) and reports
 * idle state to the server via heartbeat. Fires enrichment jobs
 * when idle thresholds are crossed.
 *
 * Returns:
 * - idleTime: ms since last activity
 * - currentTier: 0 (active) to 4 (30+ min idle)
 * - isIdle: true when idle >= first threshold (5 min)
 */
export function useIdleTracker(config: IdleConfig = {}) {
  const {
    heartbeatInterval = 30000,
    idleThresholds = [300000, 600000, 900000, 1800000],
  } = config;

  const lastActivityRef = useRef(Date.now());
  const [idleTime, setIdleTime] = useState(0);
  const [currentTier, setCurrentTier] = useState(0);
  const heartbeatSentRef = useRef<Record<number, boolean>>({});

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    // Reset heartbeat tracking when user becomes active again
    heartbeatSentRef.current = {};
  }, []);

  // Listen for activity events
  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, updateActivity, { passive: true }));
    return () => events.forEach((evt) => window.removeEventListener(evt, updateActivity));
  }, [updateActivity]);

  // Heartbeat + idle tier check
  useEffect(() => {
    const interval = setInterval(async () => {
      // Skip heartbeat when tab is hidden
      if (document.hidden) return;

      const idle = Date.now() - lastActivityRef.current;
      setIdleTime(idle);

      // Determine tier (0 = active, 1-4 = idle levels)
      let tier = 0;
      for (let i = idleThresholds.length - 1; i >= 0; i--) {
        if (idle >= idleThresholds[i]) {
          tier = i + 1;
          break;
        }
      }

      // Only send heartbeat when tier changes and hasn't been sent for this tier
      if (tier > 0 && tier !== currentTier && !heartbeatSentRef.current[tier]) {
        heartbeatSentRef.current[tier] = true;
        setCurrentTier(tier);

        try {
          const universeId = localStorage.getItem("active-universe-id");
          await fetch("/api/idle/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idleTime: idle,
              tier,
              page: window.location.pathname,
              universeId: universeId || null,
            }),
          });
        } catch {
          // Silently fail — heartbeat is best-effort
        }
      }
    }, heartbeatInterval);

    return () => clearInterval(interval);
  }, [heartbeatInterval, idleThresholds, currentTier]);

  return {
    idleTime,
    currentTier,
    isIdle: idleTime >= idleThresholds[0],
  };
}
