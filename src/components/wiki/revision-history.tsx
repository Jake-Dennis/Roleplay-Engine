'use client';
import { useState, useEffect } from 'react';
import { History, X, ChevronRight, FileText } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-formatter';

interface RevisionEntry {
  id: string;
  timestamp: string;
  content: string;
  frontmatter: Record<string, any>;
  lastModified: string;
}

interface RevisionHistoryProps {
  slug: string[];
  currentContent: string;
  currentFrontmatter: Record<string, any>;
}

/**
 * Simple line-by-line diff (unified style).
 * Returns an array of { type: 'added' | 'removed' | 'context', line: string }.
 */
function computeDiff(oldText: string, newText: string): Array<{ type: string; line: string }> {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  const result: Array<{ type: string; line: string }> = [];

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      result.push({ type: 'context', line: oldLine ?? '' });
    } else {
      if (oldLine !== undefined) result.push({ type: 'removed', line: oldLine });
      if (newLine !== undefined) result.push({ type: 'added', line: newLine });
    }
  }

  return result;
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RevisionHistory({ slug, currentContent, currentFrontmatter }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<RevisionEntry | null>(null);
  const [diffView, setDiffView] = useState(false);

  const pagePath = slug.join('/');

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/wiki-revisions?slug=${encodeURIComponent(pagePath)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load revisions');
        return res.json();
      })
      .then(data => {
        setRevisions(data.revisions || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [pagePath]);

  const handleViewRevision = async (revision: RevisionEntry) => {
    if (selectedRevision?.id === revision.id) {
      setSelectedRevision(null);
      setDiffView(false);
      return;
    }
    setSelectedRevision(revision);
    setDiffView(false);
  };

  const handleToggleDiff = () => {
    setDiffView(!diffView);
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

  if (revisions.length === 0) {
    return (
      <div className="text-sm text-center py-6 px-4">
        <div className="flex justify-center mb-3">
          <div className="w-10 h-10 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
            <History size={16} className="text-text-muted" />
          </div>
        </div>
        <p className="font-medium text-text-primary mb-1">No revisions yet</p>
        <p className="text-text-muted text-xs">Revisions are saved automatically when you edit a page.</p>
      </div>
    );
  }

  return (
    <div className="text-sm">
      <p className="font-medium mb-2 px-2">{revisions.length} revision{revisions.length !== 1 ? 's' : ''}</p>

      {selectedRevision && diffView && (
        <div className="mb-3 border border-border-default rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-bg-elevated border-b border-border-default">
            <span className="text-xs font-medium text-text-primary">
              Diff: {formatTimestamp(selectedRevision.timestamp)}
            </span>
            <button
              onClick={() => { setSelectedRevision(null); setDiffView(false); }}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto bg-bg-base font-mono text-xs">
            {computeDiff(selectedRevision.content, currentContent).map((diff, i) => (
              <div
                key={i}
                className={`px-3 py-0.5 leading-relaxed ${
                  diff.type === 'added'
                    ? 'bg-success/10 text-success'
                    : diff.type === 'removed'
                    ? 'bg-error/10 text-error'
                    : 'text-text-muted'
                }`}
              >
                <span className="select-none opacity-50 mr-2">
                  {diff.type === 'added' ? '+' : diff.type === 'removed' ? '-' : ' '}
                </span>
                {diff.line || '\u00A0'}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedRevision && !diffView && (
        <div className="mb-3 border border-border-default rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-bg-elevated border-b border-border-default">
            <span className="text-xs font-medium text-text-primary">
              {selectedRevision.frontmatter?.title || 'Untitled'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleDiff}
                className="px-2 py-1 rounded text-xs font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
              >
                Diff
              </button>
              <button
                onClick={() => { setSelectedRevision(null); }}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto bg-bg-base p-3 font-mono text-xs text-text-primary whitespace-pre-wrap">
            {selectedRevision.content}
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        {revisions.map((rev) => (
          <button
            key={rev.id}
            onClick={() => handleViewRevision(rev)}
            className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              selectedRevision?.id === rev.id
                ? 'bg-accent/10 border border-accent/30'
                : 'hover:bg-bg-raised border border-transparent'
            }`}
          >
            <ChevronRight size={12} className="text-text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <FileText size={12} className="text-text-muted shrink-0" />
                <span className="text-text-primary truncate text-xs">
                  {rev.frontmatter?.title || 'Untitled'}
                </span>
              </div>
              <div className="text-text-muted text-xs mt-0.5">
                {formatRelativeTime(rev.timestamp)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
