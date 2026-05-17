/**
 * LoreBrowser Component
 *
 * Displays a list of lore files (locations) with edit/delete actions.
 * Extracted from lore/page.tsx.
 *
 * Usage:
 *   <LoreBrowser
 *     files={locations}
 *     loading={loading}
 *     onEdit={(id) => navigate(id)}
 *     onDelete={(id) => setDeleteTarget(id)}
 *   />
 */

"use client";

import { MapPin, Sparkles, Trash2, Pencil } from "lucide-react";
import Link from "next/link";

interface LoreFile {
  id: string;
  name: string;
  importance: string;
  parent_location_id: string | null;
  created_at: string;
}

interface LoreBrowserProps {
  files: LoreFile[];
  loading: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  filter?: string;
  search?: string;
}

export function LoreBrowser({ files, loading, onEdit, onDelete }: LoreBrowserProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading locations...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
        <MapPin className="mx-auto h-10 w-10 text-text-muted" />
        <h3 className="mt-3 text-sm font-medium text-text-primary">No locations</h3>
        <p className="mt-1 text-xs text-text-muted">
          Add locations to build your world
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {files.map((location) => (
        <div
          key={location.id}
          className="flex items-center justify-between rounded-lg border border-border-default bg-bg-elevated px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <MapPin className="h-4 w-4 text-text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{location.name}</p>
              <div className="flex items-center gap-2 text-xxs text-text-muted mt-0.5">
                <span className="capitalize">{location.importance} importance</span>
                <span>·</span>
                <span>{new Date(location.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <Link
                href={`/lore/${location.id}/edit?type=locations`}
                className="rounded p-1.5 text-text-muted transition-colors hover:bg-bg-raised hover:text-accent"
                title="Edit lore"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(location.id)}
                className="rounded p-1.5 text-text-muted transition-colors hover:bg-bg-raised hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
