"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body className="bg-surface">
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-elevated p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
              <AlertTriangle className="h-8 w-8 text-error" />
            </div>
            <h1 className="mb-2 text-lg font-semibold text-text-primary">Application Error</h1>
            <p className="mb-6 text-sm text-text-muted">
              A critical error occurred. Please refresh the page.
            </p>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
