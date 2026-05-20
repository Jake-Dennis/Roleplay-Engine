'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Clock, Sparkles } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-formatter';

interface WikiFile {
  path: string;
  mtime: number;
  title: string;
  universe: string;
}

function pathToWikiUrl(filePath: string): string {
  const withoutExt = filePath.replace(/\.md$/, '');
  return `/wiki/${withoutExt.replace(/\\/g, '/')}`;
}

export default function RecentChangesWidget() {
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/wiki/recent?limit=8')
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">Recent Changes</h2>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading changes...</span>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">Recent Changes</h2>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No wiki pages yet</h3>
          <p className="mt-1 text-xs text-text-muted">
            Wiki pages will appear here as they are created
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">Recent Changes</h2>
        <Link
          href="/wiki"
          className="text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          View all
        </Link>
      </div>

      <div className="space-y-1.5">
        {files.map((file) => (
          <Link
            key={file.path}
            href={pathToWikiUrl(file.path)}
            className="flex w-full items-center justify-between rounded-lg border border-border-default bg-bg-elevated px-4 py-3 transition-colors hover:bg-bg-raised"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <FileText className="h-4 w-4 text-text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {file.title}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xxs text-text-muted">
                  {file.universe && <span>{file.universe}</span>}
                  {file.universe && <span>·</span>}
                  <Clock className="h-3 w-3" />
                  <span>{formatRelativeTime(new Date(file.mtime))}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
