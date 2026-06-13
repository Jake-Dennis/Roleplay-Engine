'use client';
import { BookOpen, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FileTree, { type FileTreePageItem, type ReorderChange } from '@/components/wiki/file-tree';
import NewFolderModal from '@/components/wiki/new-folder-modal';
import BacklinkPanel from '@/components/wiki/backlink-panel';
import VersionHistory from '@/components/wiki/version-history';
import OutlinePanel from '@/components/wiki/outline-panel';
import OutgoingLinksPanel from '@/components/wiki/outgoing-links-panel';
import MarkdownRenderer from '@/components/wiki/markdown-renderer';
import FrontmatterPropertiesPanel from '@/components/wiki/frontmatter-properties-panel';
import MarkdownEditor from '@/components/wiki/markdown-editor';
import WikiQuickSwitcher, { type WikiPage as SwitcherPage } from '@/components/wiki/wiki-quick-switcher';
import TemplateSelector, { type WikiTemplate } from '@/components/wiki/template-selector';
import CreateFromPromptModal from '@/components/wiki/create-from-prompt-modal';
import WikiAiHeaderButtons from '@/components/wiki/wiki-ai-header-buttons';
import SelectionToolbar from '@/components/wiki/selection-toolbar';
import {
  parseWikiFrontmatter,
  serializeWikiFrontmatter,
  validateWikiFrontmatter,
  EMPTY_FRONTMATTER,
} from '@/lib/wiki/frontmatter';
import type { WikiFrontmatter } from '@/lib/wiki/types';
import { useApp } from '@/contexts/app-context';
import type { WikiPage } from '@/lib/wiki/file-io';

interface BacklinkInfo {
  path: string;
  title: string;
  type: string;
  links: Array<{ name: string; context: string }>;
}

type EditMode = 'view' | 'edit' | 'preview';

export default function WikiPageView() {
  const params = useParams();
  const slug = params.slug as string[];
  const { activeUniverse } = useApp();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [orphanPaths, setOrphanPaths] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [mode, setMode] = useState<EditMode>('view');
  const [editFrontmatter, setEditFrontmatter] = useState<WikiFrontmatter>(EMPTY_FRONTMATTER);
  const [editBody, setEditBody] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // New page template selector
  const [templateOpen, setTemplateOpen] = useState(false);
  // AI create-from-prompt modal
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // New folder modal
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderOrder, setFolderOrder] = useState<string[]>([]);

  // Sidebar collapse state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Embed data for transclusion

  // Right panel state
  // Embed data for transclusion
  const [embeds, setEmbeds] = useState<Record<string, { content: string | null; frontmatter: Record<string, unknown> | null }>>({});

  useEffect(() => {
    const pagePath = slug.join('/');
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
      setSaveError(null);
    });

    // Fetch page data and folder order in parallel
    Promise.all([
      fetch(`/api/wiki/${pagePath}?universe_id=${activeUniverse?.id || ''}`).then(res => {
        if (!res.ok) throw new Error('Page not found');
        return res.json();
      }),
      fetch(`/api/wiki/config?universe_id=${activeUniverse?.id || ''}`).then(res => res.json()).catch(() => ({ folderOrder: [] })),
    ])
      .then(([data, config]) => {
        setPage(data.page);
        setAllPages(data.allPages || []);
        setOrphanPaths(data.orphanPaths || []);
        setBacklinks(data.backlinks || []);
        setEmbeds(data.embeds || {});
        setFolderOrder(config.folderOrder || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug, activeUniverse?.id]);

  // Global Cmd-K / Ctrl-K shortcut to open the quick switcher
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSwitcherOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleEditStart = () => {
    if (!page) return;
    setEditFrontmatter({ ...EMPTY_FRONTMATTER, ...page.frontmatter });
    setEditBody(page.content);
    setSaveError(null);
    setMode('edit');
  };

  const handleEditCancel = () => {
    setEditFrontmatter(EMPTY_FRONTMATTER);
    setEditBody('');
    setSaveError(null);
    setMode('view');
  };

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    setSaveError(null);

    const errors = validateWikiFrontmatter(editFrontmatter);
    if (errors.length > 0) {
      setSaveError(errors.join('; '));
      setSaving(false);
      return;
    }

    try {
      const pagePath = slug.join('/');
      const res = await fetch(`/api/wiki/${pagePath}?universe_id=${activeUniverse?.id || ''}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editBody,
          frontmatter: editFrontmatter,
          expectedLastModified: page.frontmatter?.updated,
          universeId: activeUniverse?.id,
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
      const refreshRes = await fetch(`/api/wiki/${pagePath}?universe_id=${activeUniverse?.id || ''}`);
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

  const handleTemplateSelect = async (template: WikiTemplate) => {
    const title = prompt('Enter page title:');
    if (!title || !title.trim()) return;

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
        return;
      }

      // Navigate to the new page. URL matches on-disk filename exactly
      // (no underscore → dash conversion) to avoid 404s.
      const slug = pagePath.replace(/\.md$/, '');
      router.push(`/wiki/${slug}`);
    } catch {
      alert('Network error while creating page');
    }
  };

  // Memoize the pagesByFolder derivation so the file tree doesn't refilter on every render
  const pagesByFolder = useMemo<Record<string, FileTreePageItem[]>>(() => {
    const grouped: Record<string, FileTreePageItem[]> = {};
    for (const p of allPages) {
      const folder = p.path.includes('/') ? p.path.split('/')[0] : '';
      if (!folder) continue;
      if (!grouped[folder]) grouped[folder] = [];
      grouped[folder].push({
        path: p.path,
        title: (p.frontmatter?.title as string) || p.path.split('/').pop()?.replace('.md', '') || p.path,
        type: (p.frontmatter?.type as string) || '',
        order: p.frontmatter?.order as number | undefined,
        status: p.frontmatter?.status as string | undefined,
      });
    }
    return grouped;
  }, [allPages]);

  const refreshWikiData = useCallback(async () => {
    const pagePath = slug.join('/');
    const [pageRes, configRes, allRes] = await Promise.all([
      fetch(`/api/wiki/${pagePath}?universe_id=${activeUniverse?.id || ''}`).then(r => r.json()),
      fetch(`/api/wiki/config?universe_id=${activeUniverse?.id || ''}`).then(r => r.json()).catch(() => ({ folderOrder: [] })),
      fetch(`/api/wiki?universe_id=${activeUniverse?.id || ''}`).then(r => r.json()).catch(() => ({ pages: [] })),
    ]);
    if (pageRes.page) setPage(pageRes.page);
    if (Array.isArray(pageRes.backlinks)) setBacklinks(pageRes.backlinks);
    if (Array.isArray(pageRes.orphanPaths)) setOrphanPaths(pageRes.orphanPaths);
    if (pageRes.embeds) setEmbeds(pageRes.embeds);
    if (configRes.folderOrder) setFolderOrder(configRes.folderOrder);
    if (Array.isArray(allRes.pages)) setAllPages(allRes.pages);
  }, [slug, activeUniverse?.id]);

  const handleCreateFolder = useCallback(async (folderName: string) => {
    const res = await fetch('/api/wiki/types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName, universeId: activeUniverse?.id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create folder');
    }
    const data = await res.json();
    if (Array.isArray(data.folderOrder)) {
      setFolderOrder(data.folderOrder);
    }
  }, [activeUniverse?.id]);

  const handleNavigateToPage = useCallback((path: string) => {
    const slug = path.replace(/\.md$/, '');
    router.push(`/wiki/${slug}`);
  }, [router]);

  const handleReorder = useCallback(async (change: ReorderChange) => {
    const res = await fetch('/api/wiki/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moves: change.moves,
        folderOrder: change.folderOrder,
        universeId: activeUniverse?.id,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to reorder');
    }
    // Refresh the page data so the file tree reflects the new state
    await refreshWikiData();
    // If the current page was moved, navigate to its new URL
    const moveAffectingCurrent = change.moves.find(
      (m) => m.oldPath === page?.path || m.newPath === page?.path,
    );
    if (moveAffectingCurrent && moveAffectingCurrent.newPath !== page?.path) {
      // URL matches on-disk filename exactly (no underscore → dash conversion).
      const slugStr = moveAffectingCurrent.newPath.replace(/\.md$/, '');
      router.push(`/wiki/${slugStr}`);
    }
  }, [activeUniverse?.id, refreshWikiData, page?.path, router]);
 
  if (loading) return <div className="p-8 text-center text-text-muted">Loading...</div>;
  if (error) return <div className="p-8 text-center text-error">{error}</div>;
  if (!page) return <div className="p-8 text-center text-text-muted">Page not found</div>;

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left sidebar — collapsible */}
        {leftOpen && (
          <div className="w-60 border-r border-border-default p-4 overflow-y-auto shrink-0">
            <FileTree
              pagesByFolder={pagesByFolder}
              folderOrder={folderOrder}
              currentPage={page.path}
              orphanPaths={orphanPaths}
              onCreatePage={() => setTemplateOpen(true)}
              onCreateFolder={() => setNewFolderOpen(true)}
              onReorder={handleReorder}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top bar: sidebar toggles + Browse/Graph + page actions */}
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border-default bg-bg-base shrink-0">
            {/* Left sidebar toggle */}
            <button
              onClick={() => setLeftOpen(!leftOpen)}
              className="p-1 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary transition-colors"
              title={leftOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {leftOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>

            {/* Browse / Graph nav */}
            <div className="flex gap-1 rounded-lg bg-bg-raised p-0.5">
              <button
                onClick={() => router.push('/wiki')}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors text-text-muted hover:text-text-primary"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Browse
              </button>
              <button
                onClick={() => router.push('/wiki?view=graph')}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors text-text-muted hover:text-text-primary"
              >
                <Network className="h-3.5 w-3.5" />
                Graph
              </button>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Page actions (view mode) */}
            {mode === 'view' ? (
              <>
                <button
                  onClick={() => setPromptModalOpen(true)}
                  className="px-2 py-1 rounded text-xs font-medium bg-gradient-to-r from-accent to-accent-hover text-text-primary hover:opacity-90 transition-opacity"
                >
                  AI Create
                </button>
                <span className="w-px h-4 bg-border-default" />
                <button
                  onClick={handleEditStart}
                  className="px-2 py-1 rounded text-xs font-medium bg-accent text-text-primary hover:bg-accent-hover transition-colors"
                >
                  Edit
                </button>
                <WikiAiHeaderButtons
                  pagePath={page.path}
                  universeId={activeUniverse?.id}
                />
              </>
            ) : (
              <>
                <div className="flex rounded border border-border-default overflow-hidden">
                  <button
                    onClick={() => setMode('edit')}
                    className={`px-2 py-1 text-xs font-medium transition-colors ${
                      mode === 'edit'
                        ? 'bg-accent text-text-primary'
                        : 'bg-bg-base text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setMode('preview')}
                    className={`px-2 py-1 text-xs font-medium transition-colors border-l border-border-default ${
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
                  className="px-2 py-1 rounded text-xs font-medium bg-accent text-text-primary hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleEditCancel}
                  className="px-2 py-1 rounded text-xs font-medium bg-bg-base text-text-secondary border border-border-default hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {/* Right sidebar toggle */}
            <button
              onClick={() => setRightOpen(!rightOpen)}
              className="p-1 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary transition-colors"
              title={rightOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {rightOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>

          {/* Page title bar */}
          <div className="px-8 py-2 border-b border-border-default bg-bg-elevated shrink-0">
            <h1 className="text-sm font-medium text-text-primary">
              {page.frontmatter?.title || page.path}
            </h1>
          </div>

          {/* Content + right sidebar */}
          <div className="flex-1 flex overflow-hidden">
            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-8 min-w-0">
              {mode === 'view' && (
                <MarkdownRenderer content={page.content} frontmatter={page.frontmatter} existingPages={allPages?.map(p => p.path) || []} wikiRoute="/wiki" embeds={embeds} universeId={activeUniverse?.id} />
              )}

              {mode === 'edit' && (
                <div className="flex flex-col h-full">
                  {saveError && (
                    <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20">
                      <p className="text-error text-sm">{saveError}</p>
                    </div>
                  )}
                  <FrontmatterPropertiesPanel
                    frontmatter={editFrontmatter}
                    onChange={setEditFrontmatter}
                    readOnlyFields={['created', 'updated']}
                  />
                  <div className="flex-1 overflow-y-auto p-8 relative">
                    <MarkdownEditor
                      value={editBody}
                      onChange={setEditBody}
                      onSave={handleSave}
                      existingPages={allPages?.map(p => p.path) || []}
                      minRows={20}
                      textareaRef={textareaRef}
                    />
                    <SelectionToolbar
                      textareaRef={textareaRef}
                      value={editBody}
                      onChange={setEditBody}
                    />
                  </div>
                </div>
              )}

              {mode === 'preview' && (
                <div>
                  {saveError && (
                    <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20">
                      <p className="text-error text-sm">{saveError}</p>
                    </div>
                  )}
                  <MarkdownRenderer
                    content={editBody}
                    frontmatter={editFrontmatter}
                    existingPages={allPages?.map(p => p.path) || []}
                    wikiRoute="/wiki"
                    embeds={embeds}
                    universeId={activeUniverse?.id}
                  />
                </div>
              )}
            </div>

            {/* Right sidebar — collapsible, stacked panels like Obsidian */}
            {rightOpen && (
              <div className="w-60 border-l border-border-default p-3 overflow-y-auto shrink-0 flex flex-col gap-4">
                {/* Backlinks */}
                <div>
                  <h3 className="text-xxs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-0.5 h-3 rounded-full bg-accent" />
                    Backlinks
                  </h3>
                  <BacklinkPanel backlinks={backlinks} />
                </div>

                {/* Outline */}
                <div>
                  <h3 className="text-xxs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-0.5 h-3 rounded-full bg-green-500" />
                    Outline
                  </h3>
                  <OutlinePanel content={page.content} />
                </div>

                {/* Outgoing Links */}
                <div>
                  <h3 className="text-xxs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-0.5 h-3 rounded-full bg-amber-500" />
                    Outgoing Links
                  </h3>
                  <OutgoingLinksPanel
                    content={page.content}
                    allPages={allPages}
                    basePath="/wiki"
                    universe={page.frontmatter?.universe}
                  />
                </div>

                {/* History */}
                <div>
                  <h3 className="text-xxs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-0.5 h-3 rounded-full bg-purple-500" />
                    Version History
                  </h3>
                  <VersionHistory
                    slug={slug}
                    onRestore={() => {
                      const pagePath = slug.join('/');
                      fetch(`/api/wiki/${pagePath}?universe_id=${activeUniverse?.id || ''}`)
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <WikiQuickSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        pages={(allPages || []).map((p): SwitcherPage => ({
          path: p.path,
          title: p.frontmatter?.title || p.path,
          type: p.frontmatter?.type,
        }))}
      />
      <TemplateSelector
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSelect={handleTemplateSelect}
      />
      <CreateFromPromptModal
        open={promptModalOpen}
        onClose={() => setPromptModalOpen(false)}
        universeId={activeUniverse?.id}
        onCreated={handleNavigateToPage}
      />
      <NewFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onCreate={handleCreateFolder}
      />
    </>
  );
}
