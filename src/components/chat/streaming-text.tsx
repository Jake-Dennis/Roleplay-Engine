"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useRenderLoop } from "@/hooks/use-render-loop";

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

/**
 * StreamingText — renders AI-generated text with a 30fps cursor blink.
 * Uses the render loop for cursor animation instead of CSS animations,
 * ensuring the cursor stays in sync with the 30fps cap.
 *
 * The text content itself is rendered as static React content (no per-frame re-render).
 * Only the cursor element is updated via direct DOM manipulation on each frame.
 */
export function StreamingText({ content, isStreaming, className = "" }: StreamingTextProps) {
  const cursorRef = useRef<HTMLSpanElement>(null);
  const cursorVisibleRef = useRef(true);
  const blinkAccumRef = useRef(0);

  // Streaming progress: elapsed time + word count
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed((Date.now() - startTimeRef.current) / 1000);
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      setElapsed(0);
      startTimeRef.current = null;
    }
  }, [isStreaming]);

  const wordCount = isStreaming
    ? content.split(/\s+/).filter(Boolean).length
    : 0;

  // Cursor blink via render loop (direct DOM, no React re-render)
  useRenderLoop(
    useCallback((delta: number) => {
      if (!cursorRef.current) return;

      blinkAccumRef.current += delta;
      // Toggle cursor visibility every ~533ms (16 frames at 30fps)
      if (blinkAccumRef.current >= 533) {
        blinkAccumRef.current = 0;
        cursorVisibleRef.current = !cursorVisibleRef.current;
        cursorRef.current.style.opacity = cursorVisibleRef.current ? "1" : "0";
      }
    }, []),
    isStreaming // Only animate cursor while streaming
  );

  // Hide cursor when not streaming
  if (!isStreaming) {
    return (
      <div className={`whitespace-pre-wrap text-sm text-text-primary leading-relaxed ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div className={`whitespace-pre-wrap text-sm text-text-primary leading-relaxed ${className}`}>
      {content}
      <span
        ref={cursorRef}
        className="inline-block h-3.5 w-1.5 bg-accent ml-0.5 rounded-sm"
        style={{ opacity: 1 }}
      />
      <p className="mt-2 text-xs text-text-muted">
        {wordCount} words · {elapsed.toFixed(1)}s
      </p>
    </div>
  );
}
