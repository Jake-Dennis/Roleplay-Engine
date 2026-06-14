'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GraphView from '@/components/wiki/graph-view';
import NewFolderModal from '@/components/wiki/new-folder-modal';
import TemplateSelector from '@/components/wiki/template-selector';
import type { WikiTemplate } from '@/components/wiki/template-selector';
import { LoreExtractionTrigger } from '@/components/wiki/lore-extraction-trigger';
import MarkdownRenderer from '@/components/wiki/markdown-renderer';
import MarkdownEditor from '@/components/wiki/markdown-editor';
import FrontmatterPropertiesPanel from '@/components/wiki/frontmatter-properties-panel';
import WikiAiHeaderButtons from '@/components/wiki/wiki-ai-header-buttons';
import CreateFromPromptModal from '@/components/wiki/create-from-prompt-modal';
import BacklinkPanel from '@/components/wiki/backlink-panel';
import VersionHistory from '@/components/wiki/version-history';
import OutlinePanel from '@/components/wiki/outline-panel';
import OutgoingLinksPanel from '@/components/wiki/outgoing-links-panel';
import { parseWikiFrontmatter, serializeWikiFrontmatter, validateWikiFrontmatter, EMPTY_FRONTMATTER } from '@/lib/wiki/frontmatter';
import type { WikiFrontmatter } from '@/lib/wiki/types';
import { useApp } from '@/contexts/app-context';
import { BookOpen, Network, Plus, PanelLeftClose, PanelLeftOpen, X, ExternalLink, PanelRightClose, PanelRightOpen, Sparkles, User, Ghost, MapPin, Calendar, Flag, Package, Search, Loader2 } from 'lucide-react';
import type { WikiPage } from '@/lib/wiki/file-io';

type EditMode = 'view' | 'edit' | 'preview';

interface SelectedPageData {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export default function WikiHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeUniverse } = useApp();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [orphanPaths, setOrphanPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'browse' | 'graph'>(searchParams.get('view') === 'browse' ? 'browse' : 'graph');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [selectedPageData, setSelectedPageData] = useState<SelectedPageData | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [graphOpen, setGraphOpen] = useState(true);
  const [editMode, setEditMode] = useState<EditMode>('view');
  const [editBody, setEditBody] = useState('');
  const [editFrontmatter, setEditFrontmatter] = useState<WikiFrontmatter>(EMPTY_FRONTMATTER);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [allPagesForPreview, setAllPagesForPreview] = useState<WikiPage[]>([]);
  const [backlinks, setBacklinks] = useState<Array<{ path: string; title: string; type: string; links: Array<{ name: string; context: string }> }>>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/wiki?universe_id=${activeUniverse?.id || ''}`).then(r => r.json()).catch(() => ({ pages: [], orphanPaths: [] })),
      fetch(`/api/wiki/config?universe_id=${activeUniverse?.id || ''}`).then(r => r.json()).catch(() => ({ folderOrder: [] })),
    ]).then(([wikiData, config]) => {
      setPages(wikiData.pages || []);
      setOrphanPaths(wikiData.orphanPaths || []);
      setFolderOrder(config.folderOrder || []);
      setLoading(false);
    }).catch((err) => { setError(err.message); setLoading(false); });
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

      // Navigate to the new page. URL matches on-disk filename exactly
      // (no underscore → dash conversion) to avoid 404s.
      const slug = pagePath.replace(/\.md$/, '');
      router.push(`/wiki/${slug}`);
    } catch {
      alert('Network error while creating page');
      setCreating(false);
    }
  };

  // Sidebar entity sections — group pages by subtype
  const sidebarSections = useMemo(() => {
    const typeDefs: Array<{ type: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string }> = [
      { type: 'overview', label: 'Universe', icon: BookOpen, color: 'text-cyan-400' },
      { type: 'persona', label: 'Personas', icon: User, color: 'text-blue-400' },
      { type: 'npc', label: 'NPCs', icon: Ghost, color: 'text-purple-400' },
      { type: 'location', label: 'Locations', icon: MapPin, color: 'text-green-400' },
      { type: 'item', label: 'Items', icon: Package, color: 'text-orange-400' },
      { type: 'event', label: 'Events', icon: Calendar, color: 'text-amber-400' },
      { type: 'faction', label: 'Factions', icon: Flag, color: 'text-rose-400' },
    ];

    const query = searchQuery.toLowerCase();
    const filtered = query
      ? pages.filter(p => (p.frontmatter?.title as string || '').toLowerCase().includes(query) || p.path.toLowerCase().includes(query))
      : pages;

    return typeDefs.map(def => {
      const matched = filtered
        .filter(p => {
          const subtype = (p.frontmatter?.subtype as string) || '';
          const type = (p.frontmatter?.type as string) || '';
          const eid = (p.frontmatter?.entity_id as string) || '';
          if (def.type === 'overview') return type === 'concept' || type === 'synthesis';
          if (def.type === 'persona') return (subtype === 'character' || (!subtype && type === 'entity')) && eid.startsWith('persona:');
          if (def.type === 'npc') return (subtype === 'character' || (!subtype && type === 'entity')) && (!eid || eid.startsWith('npc:'));
          return subtype === def.type;
        })
        .map(p => ({
          path: p.path,
          title: (p.frontmatter?.title as string) || p.path.split('/').pop()?.replace('.md', '') || p.path,
        }))
        .sort((a, b) => a.title.localeCompare(b.title));

      return { ...def, pages: matched };
    });
  }, [pages, searchQuery]);

  const refreshWikiData = useCallback(async () => {
    const [wikiData, config] = await Promise.all([
      fetch(`/api/wiki?universe_id=${activeUniverse?.id || ''}`).then(r => r.json()).catch(() => ({ pages: [], orphanPaths: [] })),
      fetch(`/api/wiki/config?universe_id=${activeUniverse?.id || ''}`).then(r => r.json()).catch(() => ({ folderOrder: [] })),
    ]);
    setPages(wikiData.pages || []);
    setOrphanPaths(wikiData.orphanPaths || []);
    setFolderOrder(config.folderOrder || []);
  }, [activeUniverse]);

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
  }, [activeUniverse]);

 
  // Fetch page content when selected
  const fetchPageContent = useCallback(async (pagePath: string) => {
    setLoadingPage(true);
    setEditMode('view');
    setSaveError(null);
    try {
      const res = await fetch(`/api/wiki/${pagePath}?universe_id=${activeUniverse?.id || ''}`);
      if (!res.ok) throw new Error('Failed to load page');
      const data = await res.json();
      const content = data.page?.content || data.content || '';
      const fm = data.page?.frontmatter || data.frontmatter || {};
      setSelectedPageData({ path: pagePath, content, frontmatter: fm });
      setBacklinks(data.backlinks || []);
      setAllPagesForPreview(data.allPages || []);
      setEditBody(content);
      const parsed = parseWikiFrontmatter(content);
      setEditFrontmatter(parsed.frontmatter);
    } catch {
      setSelectedPageData({ path: pagePath, content: '*Failed to load page content.*', frontmatter: {} });
      setBacklinks([]);
      setAllPagesForPreview([]);
      setEditBody('');
      setEditFrontmatter(EMPTY_FRONTMATTER);
    }
    setLoadingPage(false);
  }, [activeUniverse]);

  const handlePageSelect = useCallback((pagePath: string) => {
    setSelectedPage(pagePath);
    fetchPageContent(pagePath);
  }, [fetchPageContent]);

  const handleClosePage = useCallback(() => {
    setSelectedPage(null);
    setSelectedPageData(null);
    setEditMode('view');
    setSaveError(null);
    setBacklinks([]);
    setAllPagesForPreview([]);
    setRightOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedPage || !selectedPageData) return;
    setSaving(true);
    setSaveError(null);
    try {
      const errors = validateWikiFrontmatter(editFrontmatter);
      if (errors.length > 0) {
        setSaveError(errors.join(', '));
        setSaving(false);
        return;
      }
      const body = serializeWikiFrontmatter(editBody, editFrontmatter);
      const res = await fetch(`/api/wiki/${selectedPage}?universe_id=${activeUniverse?.id || ''}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || 'Failed to save');
        setSaving(false);
        return;
      }
      setSelectedPageData({ ...selectedPageData, content: body, frontmatter: editFrontmatter });
      setEditMode('view');
      await refreshWikiData();
    } catch {
      setSaveError('Network error while saving');
    }
    setSaving(false);
  }, [selectedPage, selectedPageData, editBody, editFrontmatter, activeUniverse, refreshWikiData]);

  const handleEditCancel = useCallback(() => {
    if (selectedPageData) {
      setEditBody(selectedPageData.content);
      const parsed = parseWikiFrontmatter(selectedPageData.content);
      setEditFrontmatter(parsed.frontmatter);
    }
    setEditMode('view');
    setSaveError(null);
  }, [selectedPageData]);

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
      {/* Left sidebar — entity browser */}
      {sidebarOpen && (
        <div className="w-60 border-r border-border-default p-3 overflow-y-auto shrink-0 flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search pages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 rounded border border-border-default bg-bg-raised text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={() => setTemplateOpen(true)}
              className="p-1.5 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary"
              title="New page"
            >
              <Plus size={14} />
            </button>
          </div>

          {sidebarSections.filter(s => s.pages.length > 0).map(section => (
            <div key={section.type}>
              <button
                onClick={() => setCollapsedSections(prev =>
                  prev.includes(section.type) ? prev.filter(t => t !== section.type) : [...prev, section.type]
                )}
                className="flex items-center gap-1.5 w-full text-left px-1 py-1 rounded hover:bg-bg-raised text-xs font-medium text-text-secondary"
              >
                <section.icon size={12} className={section.color} />
                {section.label}
                <span className="text-xxs text-text-muted ml-auto">{section.pages.length}</span>
              </button>
              {!collapsedSections.includes(section.type) && (
                <div className="mt-0.5 space-y-0.5">
                  {section.pages.map(p => (
                    <button
                      key={p.path}
                      onClick={() => handlePageSelect(p.path)}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                        selectedPage === p.path
                          ? 'bg-accent text-white'
                          : 'text-text-muted hover:text-text-primary hover:bg-bg-raised'
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {pages.length === 0 && (
            <p className="text-xs text-text-muted text-center py-4">No wiki pages yet</p>
          )}
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 min-w-0 flex flex-col ${viewMode === 'graph' ? 'overflow-hidden' : ''}`}>
        {/* Top bar — compact like Obsidian */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default bg-bg-base shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>

          <div className="flex gap-1 rounded-lg bg-bg-raised p-0.5">
            <button
              onClick={() => setViewMode('browse')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === 'browse'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Browse
            </button>
            <button
              onClick={() => { setViewMode('graph'); router.push('/wiki?view=graph', { scroll: false }); }}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === 'graph'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              Graph
            </button>
          </div>

          <div className="flex-1" />
        </div>

        {viewMode === 'browse' ? (
          <div className="flex-1 overflow-y-auto p-8">
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

            {pages.length > 0 && (() => {
              const totalChars = pages.reduce((s, p) => s + (p.content?.length || 0), 0);
              const estTokens = Math.round(totalChars / 4);
              return (
                <div className="mt-4 p-3 bg-bg-raised rounded-lg border border-border-default">
                  <p className="text-xs text-text-muted">
                    Wiki pages: <span className="font-medium text-text-primary">{pages.length}</span>
                    {' · '}~{estTokens.toLocaleString()} tokens total
                    {' · '}retrieval picks relevant pages per turn
                  </p>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex">
            {/* Page preview panel — left side */}
            {selectedPage && (
              <div className="w-[45%] min-w-0 flex flex-col bg-bg-base overflow-hidden border-r border-border-default">
                {/* Panel header with editor toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-elevated shrink-0">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {selectedPageData?.frontmatter?.title as string || selectedPage.split('/').pop()?.replace('.md', '') || selectedPage}
                  </span>

                  {/* AI buttons — visible in view mode */}
                  {editMode === 'view' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPromptModalOpen(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-bg-base text-text-secondary border border-border-default hover:text-text-primary hover:border-accent/30 transition-colors"
                        title="Create a new wiki page from a natural language description using AI"
                      >
                        <Sparkles size={12} />
                        AI Create
                      </button>
                      <WikiAiHeaderButtons
                        pagePath={selectedPage}
                        universeId={activeUniverse?.id}
                      />
                    </div>
                  )}

                  <div className="flex-1" />

                  {/* View/Edit/Preview toggle */}
                  <div className="flex rounded border border-border-default overflow-hidden">
                    <button
                      onClick={() => setEditMode('view')}
                      className={`px-2 py-1 text-xs font-medium transition-colors ${
                        editMode === 'view'
                          ? 'bg-accent text-text-primary'
                          : 'bg-bg-base text-text-muted hover:text-text-primary'
                      }`}
                      title="View the rendered page"
                    >
                      View
                    </button>
                    <button
                      onClick={() => { setEditMode('edit'); setEditBody(selectedPageData?.content || ''); const parsed = parseWikiFrontmatter(selectedPageData?.content || ''); setEditFrontmatter(parsed.frontmatter); }}
                      className={`px-2 py-1 text-xs font-medium transition-colors border-l border-border-default ${
                        editMode === 'edit'
                          ? 'bg-accent text-text-primary'
                          : 'bg-bg-base text-text-muted hover:text-text-primary'
                      }`}
                      title="Edit the page content and frontmatter"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setEditMode('preview')}
                      className={`px-2 py-1 text-xs font-medium transition-colors border-l border-border-default ${
                        editMode === 'preview'
                          ? 'bg-accent text-text-primary'
                          : 'bg-bg-base text-text-muted hover:text-text-primary'
                      }`}
                      title="Preview your edits before saving"
                    >
                      Preview
                    </button>
                  </div>

                  {/* Save/Cancel in edit mode */}
                  {editMode === 'edit' && (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-2 py-1 rounded text-xs font-medium bg-accent text-text-primary hover:bg-accent-hover transition-colors disabled:opacity-50"
                        title={saving ? 'Saving...' : 'Save your changes'}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="px-2 py-1 rounded text-xs font-medium bg-bg-base text-text-secondary border border-border-default hover:text-text-primary transition-colors"
                        title="Discard your edits"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => setRightOpen(!rightOpen)}
                    className="p-1 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary transition-colors"
                    title={rightOpen ? 'Collapse side panel' : 'Expand side panel'}
                  >
                    {rightOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                  </button>
                  <button
                    onClick={() => router.push(`/wiki/${selectedPage.replace(/\.md$/, '')}`)}
                    className="p-1 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary transition-colors"
                    title="Open full page"
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={handleClosePage}
                    className="p-1 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary transition-colors"
                    title="Close the page panel"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Save error */}
                {saveError && (
                  <div className="px-3 py-2 bg-error/10 border-b border-error/20 text-error text-xs">
                    {saveError}
                  </div>
                )}

                {/* Page content + right sidebar */}
                <div className="flex-1 flex overflow-hidden">
                  {/* Page content */}
                  <div className="flex-1 overflow-y-auto">
                    {loadingPage ? (
                      <div className="text-center text-text-muted py-8">Loading...</div>
                    ) : selectedPageData ? (
                      <>
                        {editMode === 'view' && (
                          <div className="p-6 prose prose-invert max-w-none">
                            <MarkdownRenderer
                              content={selectedPageData.content}
                              frontmatter={selectedPageData.frontmatter}
                            />
                          </div>
                        )}
                        {editMode === 'edit' && (
                          <div className="flex flex-col h-full">
                            <FrontmatterPropertiesPanel
                              frontmatter={editFrontmatter}
                              onChange={setEditFrontmatter}
                              readOnlyFields={['created', 'updated']}
                            />
                            <div className="flex-1 overflow-y-auto p-4 relative">
                              <MarkdownEditor
                                value={editBody}
                                onChange={setEditBody}
                                onSave={handleSave}
                                existingPages={pages.map(p => p.path)}
                              />
                            </div>
                          </div>
                        )}
                        {editMode === 'preview' && (
                          <div className="p-6 prose prose-invert max-w-none">
                            <MarkdownRenderer
                              content={serializeWikiFrontmatter(editBody, editFrontmatter)}
                              frontmatter={editFrontmatter}
                            />
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>

                  {/* Right sidebar — collapsible, stacked panels like Obsidian */}
                  {rightOpen && editMode === 'view' && selectedPageData && (
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
                        <OutlinePanel content={selectedPageData.content} />
                      </div>

                      {/* Outgoing Links */}
                      <div>
                        <h3 className="text-xxs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                          <span className="w-0.5 h-3 rounded-full bg-amber-500" />
                          Outgoing Links
                        </h3>
                        <OutgoingLinksPanel
                          content={selectedPageData.content}
                          allPages={allPagesForPreview}
                          basePath="/wiki"
                          universe={(selectedPageData.frontmatter as any)?.universe}
                        />
                      </div>

                      {/* History */}
                      <div>
                        <h3 className="text-xxs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                          <span className="w-0.5 h-3 rounded-full bg-purple-500" />
                          Version History
                        </h3>
                        <VersionHistory
                          slug={selectedPage.split('/')}
                          onRestore={() => fetchPageContent(selectedPage)}
                          onEdit={() => { setEditMode('edit'); setEditBody(selectedPageData?.content || ''); const parsed = parseWikiFrontmatter(selectedPageData?.content || ''); setEditFrontmatter(parsed.frontmatter); }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Graph view — right side */}
            <div className={`flex-1 min-w-0 flex flex-col`}>
              {/* Graph collapse button */}
              {selectedPage && (
                <div className="flex items-center justify-end px-2 py-1 border-b border-border-default bg-bg-elevated shrink-0">
                  <button
                    onClick={() => setGraphOpen(!graphOpen)}
                    className="p-1 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary transition-colors"
                    title={graphOpen ? 'Collapse graph' : 'Expand graph'}
                  >
                    {graphOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                  </button>
                </div>
              )}
              {graphOpen && (
                <div className="flex-1 min-h-0">
                  <GraphView
                    pages={pages}
                    isLoading={loading}
                    error={error}
                    onRetry={() => window.location.reload()}
                    focusPage={searchParams.get('focus')}
                    onPageSelect={handlePageSelect}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Template selector modal */}
      <TemplateSelector
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSelect={handleTemplateSelect}
      />
      {/* New folder modal */}
      <NewFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onCreate={handleCreateFolder}
      />
      {/* AI Create from prompt modal */}
      <CreateFromPromptModal
        open={promptModalOpen}
        onClose={() => setPromptModalOpen(false)}
        universeId={activeUniverse?.id}
        onCreated={(path) => {
          setPromptModalOpen(false);
          router.push(`/wiki/${path.replace(/\.md$/, '')}`);
        }}
      />
    </div>
  );
}
