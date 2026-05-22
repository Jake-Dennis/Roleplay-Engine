"use client";
/**
 * WikiToast Component
 *
 * Fixed-position toast notifications for wiki auto-extract events.
 * Renders stacked toasts at bottom-right, each with slide-in/out animation.
 * Click navigates to /wiki.
 */

import { useRouter } from "next/navigation";

export interface WikiToastItem {
  id: number;
  created: number;
  updated: number;
  leaving: boolean;
}

interface WikiToastProps {
  toasts: WikiToastItem[];
}

export function WikiToast({ toasts }: WikiToastProps) {
  const router = useRouter();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const isCreatedOnly = toast.created > 0 && toast.updated === 0;
        const isUpdatedOnly = toast.updated > 0 && toast.created === 0;

        return (
          <button
            key={toast.id}
            onClick={() => router.push("/wiki")}
            className={`flex items-center gap-2 rounded-lg border border-border-default border-l-4 bg-bg-raised/95 px-4 py-3 text-sm text-text-primary shadow-lg backdrop-blur-sm transition-colors hover:bg-bg-highlight ${
              toast.leaving ? "animate-toast-out" : "animate-toast-in"
            } ${
              isCreatedOnly
                ? "border-l-blue-500"
                : isUpdatedOnly
                  ? "border-l-green-500"
                  : "border-l-blue-500"
            }`}
          >
            <span className="truncate">
              📄 Wiki:{" "}
              {toast.created > 0 && (
                <span>
                  Created <span className="font-semibold text-blue-400">{toast.created}</span>
                </span>
              )}
              {toast.created > 0 && toast.updated > 0 && (
                <span>, </span>
              )}
              {toast.updated > 0 && (
                <span>
                  Updated <span className="font-semibold text-green-400">{toast.updated}</span>
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
