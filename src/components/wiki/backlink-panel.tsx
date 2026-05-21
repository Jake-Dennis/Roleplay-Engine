'use client';
import Link from 'next/link';
import { Loader2, AlertTriangle, Link2 } from 'lucide-react';

interface BacklinkInfo {
  path: string;
  title: string;
  type: string;
  links: Array<{ name: string; context: string }>;
}

interface BacklinkPanelProps {
  backlinks: BacklinkInfo[];
  basePath?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted p-4" role="status" aria-label="Loading backlinks">
      <Loader2 size={14} className="animate-spin" />
      <span>Loading backlinks...</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-sm text-center py-6 px-4" role="status" aria-label="No backlinks yet">
      <div className="flex justify-center mb-3">
        <div className="w-10 h-10 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
          <Link2 size={16} className="text-text-muted" />
        </div>
      </div>
      <p className="font-medium text-text-primary mb-1">No pages link to this yet</p>
      <p className="text-text-muted text-xs">Add wikilinks from related pages to create connections.</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="text-sm text-center py-6 px-4" role="alert" aria-label="Could not load backlinks">
      <div className="flex justify-center mb-3">
        <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
          <AlertTriangle size={18} className="text-error" />
        </div>
      </div>
      <p className="font-medium text-text-primary mb-1">Could not load backlinks</p>
      <p className="text-text-muted text-xs mb-3">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-raised border border-border-default text-text-primary text-xs font-medium hover:bg-bg-highlight transition-colors"
          aria-label="Retry loading backlinks"
        >
          <Loader2 size={12} />
          Retry
        </button>
      )}
    </div>
  );
}

export default function BacklinkPanel({ backlinks, basePath = '/wiki', isLoading, error, onRetry }: BacklinkPanelProps) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (backlinks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="text-sm">
      <p className="font-medium mb-2 px-2">{backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''}</p>
      {backlinks.map((bl) => (
        <div key={bl.path} className="mb-2 px-2">
          <Link
            href={`${basePath}/${bl.type}/${bl.path.split('/').pop()?.replace('.md', '')}`}
            className="text-accent hover:text-accent-hover font-medium"
          >
            {bl.title}
          </Link>
          {bl.links.map((link, i) => (
            <p key={i} className="text-xs text-text-muted mt-1 line-clamp-2">
              ...{link.context}...
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
