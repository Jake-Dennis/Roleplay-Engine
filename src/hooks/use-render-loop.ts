"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { renderLoop } from "@/lib/render-loop";

/**
 * Subscribe to the 30fps render loop.
 * The callback runs on every render frame (~33ms interval).
 * Use refs inside the callback to avoid re-subscribing on state changes.
 *
 * @param callback - Function called each frame with delta time in ms
 * @param enabled - Whether the subscription is active (default: true)
 */
export function useRenderLoop(
  callback: (delta: number) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(callback);

  // Always keep the ref current without re-subscribing
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = renderLoop.subscribe((delta: number) => {
      callbackRef.current(delta);
    });

    return unsubscribe;
  }, [enabled]);
}

/**
 * Get the current measured FPS from the render loop.
 * Returns a value updated each frame. Use for display-only purposes.
 */
export function useMeasuredFPS(): number {
  const [fps, setFps] = useState(30);

  useRenderLoop(
    useCallback((delta: number) => {
      setFps(Math.round(1000 / Math.max(delta, 1)));
    }, [])
  );

  return fps;
}
