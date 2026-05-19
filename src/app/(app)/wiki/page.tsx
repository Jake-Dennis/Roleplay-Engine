'use client';
import { useState, useEffect } from 'react';
import FileTree from '@/components/wiki/file-tree';
import Search from '@/components/wiki/search';
import type { WikiPage } from '@/lib/wiki/file-io';

export default function WikiHomePage() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [orphanPaths, setOrphanPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/wiki')
      .then(res => res.json())
      .then(data => {
        setPages(data.pages || []);
        setOrphanPaths(data.orphanPaths || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-text-muted">Loading wiki...</div>;
  }

  const counts = {
    entity: pages.filter(p => p.frontmatter.type === 'entity').length,
    concept: pages.filter(p => p.frontmatter.type === 'concept').length,
    source: pages.filter(p => p.frontmatter.type === 'source').length,
    synthesis: pages.filter(p => p.frontmatter.type === 'synthesis').length,
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left sidebar */}
      <div className="w-64 border-r border-border-default p-4 overflow-y-auto shrink-0">
        <Search pages={pages} />
        <div className="mt-4">
          <FileTree pages={pages} orphanPaths={orphanPaths} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-4">Wiki</h1>
        <p className="text-text-muted mb-6">
          Select a page from the sidebar or search to get started.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-bg-raised rounded-lg border border-border-default">
            <p className="text-sm font-medium">{counts.entity} Entities</p>
          </div>
          <div className="p-4 bg-bg-raised rounded-lg border border-border-default">
            <p className="text-sm font-medium">{counts.concept} Concepts</p>
          </div>
          <div className="p-4 bg-bg-raised rounded-lg border border-border-default">
            <p className="text-sm font-medium">{counts.source} Sources</p>
          </div>
          <div className="p-4 bg-bg-raised rounded-lg border border-border-default">
            <p className="text-sm font-medium">{counts.synthesis} Synthesis</p>
          </div>
        </div>
      </div>
    </div>
  );
}
