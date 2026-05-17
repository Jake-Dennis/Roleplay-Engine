import Link from "next/link";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-8">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-elevated p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
          <FileQuestion className="h-8 w-8 text-text-accent" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-text-primary">Page Not Found</h1>
        <p className="mb-6 text-sm text-text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
          >
            <Home className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-raised px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-overlay"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
