/**
 * LoadingState Component
 *
 * Standard loading indicator with animated icon.
 * Used across 18+ pages for consistent loading UX.
 */

import { Sparkles, type LucideIcon } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  icon?: LucideIcon;
}

export function LoadingState({ message = "Loading...", icon: Icon = Sparkles }: LoadingStateProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
      <Icon className="h-4 w-4 animate-pulse" />
      <span className="text-xs">{message}</span>
    </div>
  );
}
