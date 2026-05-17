"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRenderLoop } from "@/hooks/use-render-loop";
import { Gauge } from "lucide-react";

/**
 * FPS Counter — displays current measured FPS in a small overlay.
 * Color-coded: green (28-30), yellow (20-27), red (<20).
 * Toggleable via Ctrl+Shift+F. Persists visibility in localStorage.
 */
export function FPSCounter() {
  const fpsRef = useRef(30);
  const [visible, setVisible] = useState(false);
  const [displayFPS, setDisplayFPS] = useState(30);

  // Load visibility preference
  useEffect(() => {
    const stored = localStorage.getItem("fps-counter-visible");
    if (stored === "true") setVisible(true);
  }, []);

  // Keyboard toggle: Ctrl+Shift+F
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setVisible((prev) => {
          const next = !prev;
          localStorage.setItem("fps-counter-visible", String(next));
          return next;
        });
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Update FPS from render loop
  useRenderLoop(
    useCallback((delta: number) => {
      fpsRef.current = Math.round(1000 / Math.max(delta, 1));
      setDisplayFPS(fpsRef.current);
    }, [])
  );

  if (!visible) return null;

  const color =
    displayFPS >= 28 ? "text-success" : displayFPS >= 20 ? "text-warning" : "text-error";

  return (
    <div className="fixed bottom-2 right-2 z-50 flex items-center gap-1 rounded-md bg-bg-raised/90 px-2 py-1 text-xxs font-mono text-text-muted backdrop-blur-sm">
      <Gauge className={`h-3 w-3 ${color}`} />
      <span className={color}>{displayFPS} fps</span>
    </div>
  );
}
