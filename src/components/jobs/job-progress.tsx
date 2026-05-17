"use client";

/**
 * JobProgress Component
 *
 * Horizontal progress bar with percentage, color coding, and progress message.
 * Used in the jobs page to show real-time job execution status.
 *
 * Color coding:
 * - queued: gray
 * - processing: blue (animated)
 * - completed: green
 * - failed: red
 * - cancelled: muted gray
 */

import { useEffect, useRef, useState } from "react";
import { useRenderLoop } from "@/hooks/use-render-loop";

interface JobProgressProps {
  progress: number;
  message?: string | null;
  status: string;
  className?: string;
}

export function JobProgress({ progress, message, status, className = "" }: JobProgressProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [animatedProgress, setAnimatedProgress] = useState(progress);
  const targetRef = useRef(progress);

  // Sync target progress
  useEffect(() => {
    targetRef.current = progress;
  }, [progress]);

  // Animate progress using 30fps render loop
  useRenderLoop(() => {
    const target = targetRef.current;
    const current = animatedProgress;
    if (Math.abs(target - current) > 0.5) {
      // Smooth interpolation toward target
      const next = current + (target - current) * 0.15;
      setAnimatedProgress(Math.round(next * 10) / 10);
    } else if (current !== target) {
      setAnimatedProgress(target);
    }
  }, status === "processing");

  // Color based on status
  const barColor =
    status === "completed"
      ? "bg-success"
      : status === "failed"
      ? "bg-error"
      : status === "cancelled"
      ? "bg-text-muted"
      : "bg-accent";

  const textColor =
    status === "completed"
      ? "text-success"
      : status === "failed"
      ? "text-error"
      : status === "cancelled"
      ? "text-text-muted"
      : "text-accent";

  const displayProgress = status === "queued" ? 0 : status === "completed" ? 100 : animatedProgress;

  return (
    <div className={`w-full ${className}`}>
      {/* Progress bar track */}
      <div className="h-1.5 w-full rounded-full bg-bg-highlight overflow-hidden">
        <div
          ref={barRef}
          className={`h-full rounded-full transition-[width] duration-150 ease-out ${barColor} ${
            status === "processing" ? "animate-pulse" : ""
          }`}
          style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }}
        />
      </div>

      {/* Progress info */}
      <div className="flex items-center justify-between mt-1">
        <span className={`text-xxs font-medium ${textColor}`}>
          {status === "queued" && "Queued"}
          {status === "processing" && `${Math.round(displayProgress)}%`}
          {status === "completed" && "Complete"}
          {status === "failed" && "Failed"}
          {status === "cancelled" && "Cancelled"}
        </span>
        {message && status === "processing" && (
          <span className="text-xxs text-text-muted truncate ml-2">{message}</span>
        )}
      </div>
    </div>
  );
}
