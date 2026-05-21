'use client';
import { useState, useEffect, useCallback } from 'react';
import { History, X, ChevronRight, RotateCcw, Clock } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-formatter';

interface VersionEntry {
  id: string;
  page_path: string;
  user_id: string;
  version_number: number;
  change_summary: string | null;
  file_snapshot_path: string;
  created_at: string;
}

interface VersionHistoryProps {
  slug: string[];
  onRestore?: () => void;
}

export default function VersionHistory({ slug, onRestore }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const pagePath = slug.join('/');

  const loadVersions = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/wiki/history?slug=${encodeURIComponent(pagePath)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load version history');
        return res.json();
      })
      .then(data => {
        setVersions(data.versions || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [pagePath]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    setConfirmRestore(null);

    try {
      const res = await fetch('/api/wiki/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          versionId,
          slug,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        throw new Error(errorBody.error || 'Failed to restore version');
      }

      // Refresh version list
      loadVersions();

      // Notify parent to refresh page content
      onRestore?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to restore');
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-text-muted p-4">Loading history...</div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-error p-4">{error}</div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-sm text-center py-6 px-4">
        <div className="flex justify-center mb-3">
          <div className="w-10 h-10 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
            <History size={16} className="text-text-muted" />
          </div>
        </div>
        <p className="font-medium text-text-primary mb-1">No versions yet</p>
        <p className="text-text-muted text-xs">Versions are recorded when you save a page.</p>
      </div>
    );
  }

  return (
    <div className="text-sm">
      <p className="font-medium mb-2 px-2">{versions.length} version{versions.length !== 1 ? 's' : ''}</p>

      {/* Confirmation dialog */}
      {confirmRestore && (
        <div className="mb-3 p-3 rounded-lg bg-bg-elevated border border-border-default">
          <p className="text-xs text-text-primary mb-2">
            Restore to version {versions.find(v => v.id === confirmRestore)?.version_number}?
          </p>
          <p className="text-xs text-text-muted mb-3">
            This will overwrite the current page content.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleRestore(confirmRestore)}
              disabled={restoring === confirmRestore}
              className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-50"
            >
              {restoring === confirmRestore ? 'Restoring...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmRestore(null)}
              className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-bg-base text-text-secondary border border-border-default hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        {versions.map((ver) => (
          <div
            key={ver.id}
            className="group px-3 py-2 rounded-lg border border-transparent hover:bg-bg-raised transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                <Clock size={12} className="text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-text-primary text-xs font-medium">
                    v{ver.version_number}
                  </span>
                  {ver.change_summary && (
                    <span className="text-text-muted text-xs truncate">
                      {ver.change_summary}
                    </span>
                  )}
                </div>
                <div className="text-text-muted text-xs mt-0.5">
                  {formatRelativeTime(ver.created_at)}
                </div>
              </div>
              <button
                onClick={() => setConfirmRestore(ver.id)}
                disabled={restoring !== null}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent hover:bg-accent/10 transition-all disabled:opacity-0"
                title="Restore this version"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
