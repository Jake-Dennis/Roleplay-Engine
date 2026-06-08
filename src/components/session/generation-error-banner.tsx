"use client";

import { memo } from "react";

interface GenerationErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export const GenerationErrorBanner = memo(function GenerationErrorBanner({
  message,
  onDismiss,
}: GenerationErrorBannerProps) {
  if (!message) return null;

  return (
    <div className="shrink-0 mb-2 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2">
      <span className="flex-1 text-xs text-error">{message}</span>
      <button
        onClick={onDismiss}
        className="rounded p-1 text-error/70 transition-colors hover:text-error hover:bg-error/10"
      >
        ✕
      </button>
    </div>
  );
});
