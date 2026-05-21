'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import FileTree from '@/components/wiki/file-tree';
import BacklinkPanel from '@/components/wiki/backlink-panel';
import VersionHistory from '@/components/wiki/version-history';
import OutlinePanel from '@/components/wiki/outline-panel';
import OutgoingLinksPanel from '@/components/wiki/outgoing-links-panel';
import MarkdownRenderer from '@/components/wiki/markdown-renderer';
import type { WikiPage } from '@/lib/wiki/file-io';

interface BacklinkInfo {
  path: string;
  title: string;
  type: string;
  links: Array<{ name: string; context: string }>;
}

type EditMode = 'view' | 'edit' | 'preview';
type RightPanel = 'backlinks' | 'history' | 'outline' | 'links';

/**
 * Reconstruct raw markdown (frontmatter + body) from page data.
 */
function toRawMarkdown(content: string, frontmatter: Record<string, any>): string {
  const fmEntries = Object.entries(frontmatter)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map((t: string) => `  - ${t}`).join('\n')}`;
      if (typeof v === 'string') return `${k}: ${v}`;
      return `${k}: ${v}`;
    });
  return `---\n${fmEntries.join('\n')}\n---\n\n${content}`;
}

/**
 * Parse raw markdown into { content, frontmatter }.
 * Handles both with and without frontmatter delimiters.
 */
function parseRawMarkdown(raw: string): { content: string; frontmatter: Record<string, any> } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    return { content: trimmed, frontmatter: {} };
  }
  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) {
    return { content: trimmed, frontmatter: {} };
  }
  const fmBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();

  const frontmatter: Record<string, any> = {};
  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (const line of fmBlock.split('\n')) {
    const arrayMatch = line.match(/^\s+-\s+(.*)/);
    if (arrayMatch && currentKey) {
      currentArray.push(arrayMatch[1].trim());
      continue;
    }
    if (currentKey && currentArray.length > 0) {
      frontmatter[currentKey] = currentArray;
      currentKey = null;
      currentArray = [];
    }
    const kvMatch = line.match(/^(\w+):\s*(.*)/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (value === '') {
        currentKey = key;
        currentArray = [];
      } else {
        frontmatter[key] = value;
      }
    }
  }
  if (currentKey && currentArray.length > 0) {
    frontmatter[currentKey] = currentArray;
  }

  return { content: body, frontmatter };
}

export default function WikiPageView() {
  const params = useParams();
  const slug = params.slug as string[];
  const [page, setPage] = useState<WikiPage | null>(null);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [orphanPaths, setOrphanPaths] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [mode, setMode] = useState<EditMode>('view');
  const [editContent, setEditContent] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Right panel state
  const [rightPanel, setRightPanel] = useState<RightPanel>('backlinks');

  // Embed data for transclusion
  const [embeds, setEmbeds] = useState<Record<string, { content: string | null; frontmatter: Record<string, any> | null }>>({});

  useEffect(() => {
    const pagePath = slug.join('/');
    setLoading(true);
    setError(null);
    setSaveError(null);

    fetch(`/api/wiki/${pagePath}`)
      .then(res => {
        if (!res.ok) throw new Error('Page not found');
        return res.json();
      })
      .then(data => {
        setPage(data.page);
        setAllPages(data.allPages || []);
        setOrphanPaths(data.orphanPaths || []);
        setBacklinks(data.backlinks || []);
        setEmbeds(data.embeds || {});
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  const handleEditStart = () => {
    if (!page) return;
    setEditContent(toRawMarkdown(page.content, page.frontmatter));
    setSaveError(null);
    setMode('edit');
  };

  const handleEditCancel = () => {
    setEditContent('');
    setSaveError(null);
    setMode('view');
  };

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    setSaveError(null);

    const { content: newContent, frontmatter: newFrontmatter } = parseRawMarkdown(editContent);

    try {
      const pagePath = slug.join('/');
      const res = await fetch(`/api/wiki/${pagePath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          frontmatter: newFrontmatter,
          expectedLastModified: page.frontmatter?.updated,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        if (res.status === 409) {
          setSaveError('Another edit was saved while you were working. Please refresh and try again.');
        } else {
          setSaveError(errorBody.error || 'Failed to save');
        }
        setSaving(false);
        return;
      }

      // Refresh page data
      const refreshRes = await fetch(`/api/wiki/${pagePath}`);
      const refreshData = await refreshRes.json();
      setPage(refreshData.page);
      setAllPages(refreshData.allPages || []);
      setOrphanPaths(refreshData.orphanPaths || []);
      setBacklinks(refreshData.backlinks || []);
      setEmbeds(refreshData.embeds || {});
      setMode('view');
    } catch {
      setSaveError('Network error while saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-text-muted">Loading...</div>;
  if (error) return <div className="p-8 text-center text-error">{error}</div>;
  if (!page) return <div className="p-8 text-center text-text-muted">Page not found</div>;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left sidebar */}
      <div className="w-64 border-r border-border-default p-4 overflow-y-auto shrink-0">
        <FileTree pages={allPages} currentPage={page.path} orphanPaths={orphanPaths} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header with mode toggle */}
        <div className="flex items-center justify-between px-8 py-3 border-b border-border-default bg-bg-elevated shrink-0">
          <h1 className="text-sm font-medium text-text-primary">
            {page.frontmatter?.title || page.path}
          </h1>
          <div className="flex items-center gap-2">
            {mode === 'view' ? (
              <>
                <button
                  onClick={() => setRightPanel('backlinks')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    rightPanel === 'backlinks'
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-bg-base text-text-secondary border border-border-default hover:text-text-primary'
                  }`}
                >
                  Backlinks
                </button>
                <button
                  onClick={() => setRightPanel('history')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    rightPanel === 'history'
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-bg-base text-text-secondary border border-border-default hover:text-text-primary'
                  }`}
                >
                  History
                </button>
                <button
                  onClick={() => setRightPanel('outline')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    rightPanel === 'outline'
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-bg-base text-text-secondary border border-border-default hover:text-text-primary'
                  }`}
                >
                  Outline
                </button>
                <button
                  onClick={() => setRightPanel('links')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    rightPanel === 'links'
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-bg-base text-text-secondary border border-border-default hover:text-text-primary'
                  }`}
                >
                  Links
                </button>
                <button
                  onClick={handleEditStart}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-text-primary hover:bg-accent-hover transition-colors"
                >
                  Edit
                </button>
              </>
            ) : (
              <>
                <div className="flex rounded border border-border-default overflow-hidden">
                  <button
                    onClick={() => setMode('edit')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === 'edit'
                        ? 'bg-accent text-text-primary'
                        : 'bg-bg-base text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setMode('preview')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border-default ${
                      mode === 'preview'
                        ? 'bg-accent text-text-primary'
                        : 'bg-bg-base text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Preview
                  </button>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-text-primary hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleEditCancel}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-bg-base text-text-secondary border border-border-default hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-8">
          {mode === 'view' && (
            <MarkdownRenderer content={page.content} frontmatter={page.frontmatter} existingPages={allPages?.map(p => p.path) || []} wikiRoute="/wiki" embeds={embeds} />
          )}

          {mode === 'edit' && (
            <div className="flex flex-col h-full">
              {saveError && (
                <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20">
                  <p className="text-error text-sm">{saveError}</p>
                </div>
              )}
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="flex-1 w-full p-4 font-mono text-sm text-text-primary bg-bg-base border border-border-default rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                spellCheck={false}
              />
            </div>
          )}

          {mode === 'preview' && (
            <div>
              {saveError && (
                <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20">
                  <p className="text-error text-sm">{saveError}</p>
                </div>
              )}
              {(() => {
                const { content, frontmatter } = parseRawMarkdown(editContent);
                return (
                  <MarkdownRenderer content={content} frontmatter={frontmatter} existingPages={allPages?.map(p => p.path) || []} wikiRoute="/wiki" embeds={embeds} />
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-64 border-l border-border-default p-4 overflow-y-auto shrink-0">
        {rightPanel === 'backlinks' && (
          <BacklinkPanel backlinks={backlinks} />
        )}
        {rightPanel === 'history' && (
          <VersionHistory
            slug={slug}
            onRestore={() => {
              const pagePath = slug.join('/');
              fetch(`/api/wiki/${pagePath}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                  if (data) {
                    setPage(data.page);
                    setAllPages(data.allPages || []);
                    setOrphanPaths(data.orphanPaths || []);
                    setBacklinks(data.backlinks || []);
                    setEmbeds(data.embeds || {});
                  }
                });
            }}
          />
        )}
        {rightPanel === 'outline' && (
          <OutlinePanel content={page.content} />
        )}
        {rightPanel === 'links' && (
          <OutgoingLinksPanel
            content={page.content}
            allPages={allPages}
            basePath="/wiki"
            universe={page.frontmatter?.universe}
          />
        )}
      </div>
    </div>
  );
}
