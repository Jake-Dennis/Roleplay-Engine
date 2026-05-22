'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GraphView from '@/components/wiki/graph-view';
import FileTree from '@/components/wiki/file-tree';
import Search from '@/components/wiki/search';
import TemplateSelector from '@/components/wiki/template-selector';
import type { WikiTemplate } from '@/components/wiki/template-selector';
import { LoreExtractionTrigger } from '@/components/wiki/lore-extraction-trigger';
import { useApp } from '@/contexts/app-context';
import { BookOpen, Network, Plus } from 'lucide-react';
import type { WikiPage } from '@/lib/wiki/file-io';

export default function WikiHomePage() {
  const router = useRouter();
  const { activeUniverse } = useApp();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [orphanPaths, setOrphanPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'browse' | 'graph'>('browse');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/wiki?universe_id=${activeUniverse?.id || ''}`)
      .then(res => res.json())
      .then(data => {
        setPages(data.pages || []);
        setOrphanPaths(data.orphanPaths || []);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [activeUniverse]);

  const handleTemplateSelect = async (template: WikiTemplate) => {
    const title = prompt('Enter page title:');
    if (!title || !title.trim()) return;

    setCreating(true);
    setTemplateOpen(false);

    // Replace {{title}} placeholders in template content
    const filledContent = template.content.replace(/\{\{title\}\}/g, title.trim());

    // Determine folder based on template type
    const folder = template.type === 'concept' ? 'concepts' : 'entities';
    const pagePath = `${folder}/${title.trim().toLowerCase().replace(/\s+/g, '_')}.md`;

    try {
      const res = await fetch('/api/wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: pagePath,
          content: filledContent,
          frontmatter: {
            title: title.trim(),
            type: template.type,
            status: 'draft',
            tags: [],
          },
          universeId: activeUniverse?.id,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        alert(errorBody.error || 'Failed to create page');
        setCreating(false);
        return;
      }

      // Navigate to the new page
      const slug = pagePath.replace('.md', '').replace(/_/g, '-');
      router.push(`/wiki/${slug}`);
    } catch {
      alert('Network error while creating page');
      setCreating(false);
    }
  };

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
          <FileTree pages={pages} orphanPaths={orphanPaths} onCreatePage={() => setTemplateOpen(true)} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-bg-raised p-1 mb-6 w-fit">
          <button
            onClick={() => setViewMode('browse')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === 'browse'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Browse
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === 'graph'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            Graph
          </button>
        </div>

        {viewMode === 'browse' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold">Wiki</h1>
              <button
                onClick={() => setTemplateOpen(true)}
                disabled={creating}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-text-primary text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                <Plus size={14} />
                {creating ? 'Creating...' : 'New Page'}
              </button>
            </div>
            <p className="text-text-muted mb-6">
              Select a page from the sidebar or search to get started.
            </p>
            {activeUniverse && (
              <div className="mb-6">
                <LoreExtractionTrigger universeId={activeUniverse.id} />
              </div>
            )}
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
          </>
        ) : (
          <GraphView pages={pages} isLoading={loading} error={error} onRetry={() => window.location.reload()} />
        )}
      </div>

      {/* Template selector modal */}
      <TemplateSelector
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}
