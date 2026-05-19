'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Folder, FileText, ChevronRight, ChevronDown, Users, BookOpen, FileText as FileIcon, GitBranch, Plus, AlertTriangle, RefreshCw } from 'lucide-react';

interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  frontmatter?: Record<string, any>;
  children?: TreeNode[];
}

interface FileTreeProps {
  wikiRoot?: string;
  pages: Array<{ path: string; frontmatter: Record<string, any> }>;
  currentPage?: string;
  basePath?: string;
  orphanPaths?: string[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onCreatePage?: () => void;
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  entity: Users,
  concept: BookOpen,
  source: FileIcon,
  synthesis: GitBranch,
};

function SkeletonTree() {
  return (
    <div className="text-sm animate-pulse" role="status" aria-label="Loading file tree">
      {['entities', 'concepts', 'sources'].map((folder, fi) => (
        <div key={folder} className="mb-1">
          <div className="flex items-center gap-1 px-2 py-1">
            <div className="w-3.5 h-3.5 rounded bg-bg-highlight" />
            <div className="w-3.5 h-3.5 rounded bg-bg-highlight" />
            <div className="w-16 h-3 rounded bg-bg-highlight" />
          </div>
          <div className="ml-4">
            {Array.from({ length: 3 - fi }).map((_, i) => (
              <div key={i} className="flex items-center gap-1 px-2 py-1">
                <div className="w-3 h-3 rounded bg-bg-highlight" />
                <div className="w-24 h-3 rounded bg-bg-highlight" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading file tree...</span>
    </div>
  );
}

function EmptyState({ onCreatePage }: { onCreatePage?: () => void }) {
  return (
    <div className="text-sm text-center py-8 px-4" role="status" aria-label="No wiki pages yet">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
          <FileText size={20} className="text-text-muted" />
        </div>
      </div>
      <p className="font-medium text-text-primary mb-1">No wiki pages yet</p>
      <p className="text-text-muted text-xs mb-4">Create your first page to start building your knowledge base.</p>
      {onCreatePage && (
        <button
          onClick={onCreatePage}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-text-primary text-xs font-medium hover:bg-accent-hover transition-colors"
          aria-label="Create your first page"
        >
          <Plus size={12} />
          Create your first page
        </button>
      )}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="text-sm text-center py-6 px-4" role="alert" aria-label="Failed to load pages">
      <div className="flex justify-center mb-3">
        <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
          <AlertTriangle size={18} className="text-error" />
        </div>
      </div>
      <p className="font-medium text-text-primary mb-1">Failed to load pages</p>
      <p className="text-text-muted text-xs mb-3">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-raised border border-border-default text-text-primary text-xs font-medium hover:bg-bg-highlight transition-colors"
          aria-label="Retry loading pages"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}

export default function FileTree({ pages, currentPage, basePath = '/wiki', orphanPaths, isLoading, error, onRetry, onCreatePage }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['entities', 'concepts', 'sources', 'synthesis']));
  const orphanSet = useMemo(() => new Set(orphanPaths || []), [orphanPaths]);

  if (isLoading) {
    return <SkeletonTree />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  // Group pages by folder
  const folders: Record<string, Array<{ path: string; frontmatter: Record<string, any> }>> = {};
  for (const page of pages) {
    const parts = page.path.replace(/\\/g, '/').split('/');
    const folder = parts[parts.length - 2] || 'root';
    if (!folders[folder]) folders[folder] = [];
    folders[folder].push(page);
  }

  const hasPages = Object.keys(folders).length > 0 && pages.length > 0;

  if (!hasPages) {
    return <EmptyState onCreatePage={onCreatePage} />;
  }

  const toggle = (folder: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const FOLDER_ORDER = ['entities', 'concepts', 'sources', 'synthesis', '_review'];

  // Map singular frontmatter type to plural folder name used in wiki directory structure
  const typeToFolder: Record<string, string> = {
    entity: 'entities',
    concept: 'concepts',
    source: 'sources',
    synthesis: 'synthesis',
  };

  return (
    <div className="text-sm">
      {FOLDER_ORDER.filter(f => folders[f]).map(folder => (
        <div key={folder}>
          <button
            onClick={() => toggle(folder)}
            className="flex items-center gap-1 w-full px-2 py-1 hover:bg-bg-raised rounded text-left"
          >
            {expanded.has(folder) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Folder size={14} className="text-accent" />
            <span className="font-medium">{folder}</span>
          </button>
          {expanded.has(folder) && (
            <div className="ml-4">
              {folders[folder].map(page => {
                const name = page.frontmatter.title || page.path.split('/').pop()?.replace('.md', '');
                const isActive = page.path === currentPage;
                const Icon = TYPE_ICONS[page.frontmatter.type as keyof typeof TYPE_ICONS] || FileText;
                const isOrphan = orphanSet.has(page.path);
                const folderName = typeToFolder[page.frontmatter.type] || folder;
                return (
                  <Link
                    key={page.path}
                    href={`${basePath}/${folderName}/${page.path.split('/').pop()?.replace('.md', '')}`}
                    className={`flex items-center gap-1 px-2 py-1 rounded ${isActive ? 'bg-accent-muted text-accent' : 'hover:bg-bg-raised'}`}
                  >
                    <Icon size={12} />
                    <span className="truncate">{name}</span>
                    {isOrphan && (
                      <span className="ml-auto text-[10px] px-1 py-0.5 rounded bg-warning/20 text-warning font-medium" title="No inbound or outbound wikilinks">
                        orphan
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
