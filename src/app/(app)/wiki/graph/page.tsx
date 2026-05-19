'use client';
import { useState, useEffect } from 'react';
import GraphView from '@/components/wiki/graph-view';
import type { WikiPage } from '@/lib/wiki/file-io';

export default function WikiGraphPage() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/wiki')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load wiki pages');
        return res.json();
      })
      .then(data => {
        setPages(data.pages || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-4">Knowledge Graph</h1>
        <p className="text-text-muted mb-6">
          Visual representation of wikilink connections between pages.
        </p>
        <GraphView pages={pages} isLoading={loading} error={error} onRetry={() => window.location.reload()} />
      </div>
    </div>
  );
}
