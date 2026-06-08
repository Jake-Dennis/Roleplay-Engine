'use client';
import { useState, useMemo, useRef, useCallback, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  Users,
  BookOpen,
  FileText as FileIcon,
  GitBranch,
  Plus,
  AlertTriangle,
  RefreshCw,
  FolderPlus,
  X,
  Loader2,
  Check,
} from 'lucide-react';

export interface FileTreePageItem {
  path: string;          // relative path e.g. "entities/characters/foo.md"
  title: string;
  type: string;
  order?: number;
  status?: string;       // frontmatter status (used for dormant filtering)
}

export interface ReorderChange {
  moves: Array<{ oldPath: string; newPath: string; order?: number }>;
  folderOrder?: string[];
}

interface SubfolderInfo {
  /** Subfolder path, e.g. "entities/characters" */
  path: string;
  /** Display name, e.g. "characters" */
  name: string;
  /** Pages within this subfolder */
  pages: FileTreePageItem[];
}

interface TopLevelInfo {
  /** Pages directly in the top folder (no subtype subfolder) */
  directPages: FileTreePageItem[];
  /** Subtype subfolders */
  subfolders: SubfolderInfo[];
}

interface FileTreeProps {
  pagesByFolder: Record<string, FileTreePageItem[]>;
  folderOrder: string[];
  currentPage?: string;
  basePath?: string;
  orphanPaths?: string[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Legacy callback — used by empty-state "Create your first page" button */
  onCreatePage?: () => void;
  onCreateFolder?: () => void;
  onReorder?: (change: ReorderChange) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Type/subtype definitions for the quick-create flow
// ---------------------------------------------------------------------------
const QUICK_CREATE_TYPES: Array<{
  type: string;
  folder: string;
  label: string;
  subtypes: string[];
}> = [
  { type: 'entity', folder: 'entities', label: 'Entity', subtypes: ['character', 'location', 'item', 'faction', 'organization', 'creature'] },
  { type: 'concept', folder: 'concepts', label: 'Concept', subtypes: ['theme', 'rule', 'mechanic', 'lore', 'event', 'tradition'] },
  { type: 'source', folder: 'sources', label: 'Source', subtypes: [] },
  { type: 'synthesis', folder: 'synthesis', label: 'Synthesis', subtypes: [] },
];

const TYPE_CREATE_ICONS: Record<string, typeof FileText> = {
  entity: Users,
  concept: BookOpen,
  source: FileIcon,
  synthesis: GitBranch,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, typeof FileText> = {
  entity: Users,
  concept: BookOpen,
  source: FileIcon,
  synthesis: GitBranch,
};

/** Extract the top-level folder from a path: "entities/characters/gandalf.md" → "entities" */
const topFolderOf = (path: string) => path.includes('/') ? path.split('/')[0] : '';

/** Alias for backward compat */
const folderOf = topFolderOf;

/**
 * Extract the 2-level subfolder path from a path.
 * "entities/characters/gandalf.md" → "entities/characters"
 * "entities/foo.md" → null (no subfolder, page is directly in top folder)
 */
const subfolderOf = (path: string): string | null => {
  const parts = path.split('/');
  if (parts.length >= 3) return parts.slice(0, 2).join('/');
  return null;
};

const pathOf = (folder: string, filename: string) => `${folder}/${filename.replace(/\.md$/, '')}.md`;
const idForPage = (path: string) => `page:${path}`;
const idForFolder = (name: string) => `folder:${name}`;
const idForSubfolder = (subfolderPath: string) => `subfolder:${subfolderPath}`;
const pageIdToPath = (id: string) => id.startsWith('page:') ? id.slice(5) : '';
const folderIdToName = (id: string) => id.startsWith('folder:') ? id.slice(7) : '';
const subfolderIdToPath = (id: string) => id.startsWith('subfolder:') ? id.slice('subfolder:'.length) : '';

// ---------------------------------------------------------------------------
// Hierarchy builder
// ---------------------------------------------------------------------------

function buildHierarchy(pagesByFolder: Record<string, FileTreePageItem[]>): Record<string, TopLevelInfo> {
  const hierarchy: Record<string, TopLevelInfo> = {};

  for (const [topFolder, pages] of Object.entries(pagesByFolder)) {
    const directPages: FileTreePageItem[] = [];
    const subfolderMap = new Map<string, FileTreePageItem[]>();

    for (const page of pages) {
      const sf = subfolderOf(page.path);
      if (sf) {
        if (!subfolderMap.has(sf)) subfolderMap.set(sf, []);
        subfolderMap.get(sf)!.push(page);
      } else {
        directPages.push(page);
      }
    }

    // Sort pages within each subfolder by order, then title
    const sortPages = (arr: FileTreePageItem[]) =>
      arr.sort((a, b) => {
        const aOrder = a.order ?? Number.POSITIVE_INFINITY;
        const bOrder = b.order ?? Number.POSITIVE_INFINITY;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.title || a.path).localeCompare(b.title || b.path);
      });

    const subfolders: SubfolderInfo[] = [];
    for (const [sfPath, sfPages] of subfolderMap) {
      const name = sfPath.split('/').pop() || '';
      subfolders.push({ path: sfPath, name, pages: sortPages(sfPages) });
    }
    subfolders.sort((a, b) => a.name.localeCompare(b.name));

    hierarchy[topFolder] = {
      directPages: sortPages(directPages),
      subfolders,
    };
  }

  return hierarchy;
}

// ---------------------------------------------------------------------------
// Skeleton / Empty / Error states
// ---------------------------------------------------------------------------

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

function EmptyState({ onCreatePage, onCreateFolder }: { onCreatePage?: () => void; onCreateFolder?: () => void }) {
  return (
    <div className="text-sm text-center py-8 px-4" role="status" aria-label="No wiki pages yet">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
          <FileText size={20} className="text-text-muted" />
        </div>
      </div>
      <p className="font-medium text-text-primary mb-1">No wiki pages yet</p>
      <p className="text-text-muted text-xs mb-4">Create your first page to start building your knowledge base.</p>
      <div className="flex flex-col gap-2 items-center">
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
        {onCreateFolder && (
          <button
            onClick={onCreateFolder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-raised border border-border-default text-text-primary text-xs font-medium hover:bg-bg-highlight transition-colors"
            aria-label="Create your first folder"
          >
            <FolderPlus size={12} />
            Create a folder
          </button>
        )}
      </div>
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

// ---------------------------------------------------------------------------
// Quick Create Modal
// ---------------------------------------------------------------------------

interface CreateFlowProps {
  open: boolean;
  onClose: () => void;
  onCreateComplete: (type: string, subtype: string | null, title: string) => Promise<void>;
}

function QuickCreateModal({ open, onClose, onCreateComplete }: CreateFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when step 3 is reached
  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  if (!open) return null;

  const currentTypeDef = QUICK_CREATE_TYPES.find((t) => t.type === selectedType);
  const hasSubtypes = currentTypeDef && currentTypeDef.subtypes.length > 0;

  const reset = () => {
    setStep(1);
    setSelectedType(null);
    setSelectedSubtype(null);
    setTitle('');
    setCreating(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTypeSelect = (typeDef: (typeof QUICK_CREATE_TYPES)[0]) => {
    setSelectedType(typeDef.type);
    setSelectedSubtype(null);
    if (typeDef.subtypes.length === 0) {
      // No subtypes, go straight to title
      setStep(3);
      focusInput();
    } else {
      setStep(2);
    }
  };

  const handleSubtypeSelect = (subtype: string) => {
    setSelectedSubtype(subtype);
    setStep(3);
    focusInput();
  };

  const handleCreate = async () => {
    if (!selectedType || !title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onCreateComplete(selectedType, selectedSubtype, title.trim());
      reset();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm bg-bg-elevated border border-border-default rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <h3 className="text-sm font-semibold text-text-primary">
            {step === 1 && 'Select page type'}
            {step === 2 && 'Select subtype'}
            {step === 3 && 'Enter page title'}
          </h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-bg-highlight text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              step >= 1 ? 'bg-accent text-white' : 'bg-bg-raised text-text-muted'
            }`}>1</span>
            <span className="h-px w-6 bg-border-default" />
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              step >= 2 ? 'bg-accent text-white' : 'bg-bg-raised text-text-muted'
            }`}>2</span>
            <span className="h-px w-6 bg-border-default" />
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              step >= 3 ? 'bg-accent text-white' : 'bg-bg-raised text-text-muted'
            }`}>3</span>
          </div>

          {error && (
            <div className="mb-3 p-2 rounded bg-error/10 border border-error/20 text-error text-xs">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-2">
              {QUICK_CREATE_TYPES.map((tdef) => {
                const Icon = TYPE_CREATE_ICONS[tdef.type] || FileText;
                return (
                  <button
                    key={tdef.type}
                    onClick={() => handleTypeSelect(tdef)}
                    className="flex items-center gap-3 w-full p-3 rounded-lg border border-border-default bg-bg-base hover:bg-bg-raised hover:border-accent/30 transition-colors text-left"
                  >
                    <div className="p-1.5 rounded-lg bg-accent/10 text-accent">
                      <Icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{tdef.label}</p>
                      {tdef.subtypes.length > 0 && (
                        <p className="text-[11px] text-text-muted mt-0.5">
                          {tdef.subtypes.length} subtypes &middot; {tdef.folder} folder
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && currentTypeDef && (
            <div className="grid grid-cols-2 gap-2">
              {currentTypeDef.subtypes.map((subtype) => (
                <button
                  key={subtype}
                  onClick={() => handleSubtypeSelect(subtype)}
                  className="flex items-center gap-2 p-3 rounded-lg border border-border-default bg-bg-base hover:bg-bg-raised hover:border-accent/30 transition-colors text-left"
                >
                  <span className="text-sm capitalize text-text-primary">{subtype}</span>
                </button>
              ))}
              {/* Back button */}
              <button
                onClick={() => setStep(1)}
                className="col-span-2 text-xs text-text-muted hover:text-text-primary transition-colors mt-1"
              >
                &larr; Back to type selection
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="mb-3 text-xs text-text-muted">
                Creating a{selectedSubtype ? ` ${selectedSubtype}` : ''} page in{' '}
                <span className="font-medium text-text-primary">
                  {currentTypeDef?.folder}/{selectedSubtype ? `${selectedSubtype}s` : ''}
                </span>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && title.trim() && !creating) handleCreate();
                  if (e.key === 'Escape') handleClose();
                }}
                placeholder="Enter page title..."
                className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                disabled={creating}
                autoFocus
              />
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => hasSubtypes ? setStep(2) : setStep(1)}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                  disabled={creating}
                >
                  &larr; Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!title.trim() || creating}
                  className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  {creating ? 'Creating...' : 'Create Page'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable page row
// ---------------------------------------------------------------------------

const SortablePageRow = memo(function SortablePageRow({
  page,
  basePath,
  isActive,
  isOrphan,
  isOverlay,
}: {
  page: FileTreePageItem;
  basePath: string;
  isActive: boolean;
  isOrphan: boolean;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: idForPage(page.path), data: { type: 'page', folder: folderOf(page.path), subfolder: subfolderOf(page.path) } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = TYPE_ICONS[page.type] || FileText;
  const folder = folderOf(page.path);
  const slug = page.path.split('/').pop()?.replace(/\.md$/, '') || '';

  const opacity = isDragging && !isOverlay ? 0.3 : 1;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, opacity }}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <Link
        href={`${basePath}/${folder}/${slug}`}
        className={`flex items-center gap-1 px-2 py-1 rounded ${
          isActive ? 'bg-accent-muted text-accent' : 'hover:bg-bg-raised'
        }`}
      >
        <Icon size={12} />
        <span className="truncate">{page.title || slug}</span>
        {isOrphan && (
          <span className="ml-auto text-[10px] px-1 py-0.5 rounded bg-warning/20 text-warning font-medium" title="No inbound or outbound wikilinks">
            orphan
          </span>
        )}
      </Link>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Subfolder section (droppable header + sortable page list)
// ---------------------------------------------------------------------------

const SubfolderSection = memo(function SubfolderSection({
  subfolder,
  basePath,
  orphanSet,
  currentPage,
  isExpanded,
  onToggle,
}: {
  subfolder: SubfolderInfo;
  basePath: string;
  orphanSet: Set<string>;
  currentPage?: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: idForSubfolder(subfolder.path),
    data: { type: 'subfolder', subfolder: subfolder.path },
  });

  return (
    <div ref={setNodeRef}>
      <button
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className={`flex items-center gap-1 w-full px-2 py-1 rounded text-left transition-colors ${
          isOver ? 'bg-accent/10' : 'hover:bg-bg-raised'
        }`}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-text-muted text-[10px]">&mdash;</span>
        <span className="font-medium text-sm">{subfolder.name}</span>
        <span className="text-[10px] text-text-muted ml-1">({subfolder.pages.length})</span>
      </button>
      {isExpanded && (
        <div className="ml-4">
          <SortableContext
            items={subfolder.pages.map((p) => idForPage(p.path))}
            strategy={verticalListSortingStrategy}
          >
            {subfolder.pages.map((p) => (
              <SortablePageRow
                key={p.path}
                page={p}
                basePath={basePath}
                isActive={p.path === currentPage}
                isOrphan={orphanSet.has(p.path)}
              />
            ))}
            {subfolder.pages.length === 0 && (
              <div className="text-[10px] text-text-muted px-2 py-1 italic">
                Drop pages here
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Top-level folder: always expanded, contains direct pages + subfolders
// ---------------------------------------------------------------------------

function TopLevelFolderContent({
  topFolder,
  info,
  basePath,
  orphanSet,
  currentPage,
  subfolderExpanded,
  onSubfolderToggle,
}: {
  topFolder: string;
  info: TopLevelInfo;
  basePath: string;
  orphanSet: Set<string>;
  currentPage?: string;
  subfolderExpanded: Set<string>;
  onSubfolderToggle: (subfolderPath: string) => void;
}) {
  const totalPages = info.directPages.length +
    info.subfolders.reduce((sum, sf) => sum + sf.pages.length, 0);

  return (
    <div className="ml-4">
      {/* Direct pages in top folder (no subtype subfolder) */}
      {info.directPages.length > 0 && (
        <div className="mb-1">
          <SortableContext
            items={info.directPages.map((p) => idForPage(p.path))}
            strategy={verticalListSortingStrategy}
          >
            {info.directPages.map((p) => (
              <SortablePageRow
                key={p.path}
                page={p}
                basePath={basePath}
                isActive={p.path === currentPage}
                isOrphan={orphanSet.has(p.path)}
              />
            ))}
          </SortableContext>
        </div>
      )}

      {/* No pages at all */}
      {info.directPages.length === 0 && info.subfolders.length === 0 && (
        <div className="text-[10px] text-text-muted px-2 py-1 italic">
          Empty folder
        </div>
      )}

      {/* Subtype subfolders */}
      {info.subfolders.map((sf) => (
        <SubfolderSection
          key={sf.path}
          subfolder={sf}
          basePath={basePath}
          orphanSet={orphanSet}
          currentPage={currentPage}
          isExpanded={subfolderExpanded.has(sf.path)}
          onToggle={() => onSubfolderToggle(sf.path)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable folder wrapper (for folder reordering)
// ---------------------------------------------------------------------------

const SortableFolderWrapper = memo(function SortableFolderWrapper(props: {
  folder: string;
  info: TopLevelInfo;
  basePath: string;
  orphanSet: Set<string>;
  currentPage?: string;
  subfolderExpanded: Set<string>;
  onSubfolderToggle: (subfolderPath: string) => void;
}) {
  const { folder, info, subfolderExpanded, onSubfolderToggle } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: idForFolder(folder),
    data: { type: 'folder' },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const totalPages = info.directPages.length +
    info.subfolders.reduce((sum, sf) => sum + sf.pages.length, 0);

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <div className="flex items-center">
        <div className="flex items-center gap-1 flex-1 px-2 py-1 text-left">
          <Folder size={14} className="text-accent shrink-0" />
          <span className="font-medium">{folder}</span>
          <span className="text-[10px] text-text-muted ml-1">({totalPages})</span>
        </div>
        <button
          {...(listeners as unknown as Record<string, unknown>)}
          {...(attributes as unknown as Record<string, unknown>)}
          aria-label={`Drag to reorder folder ${folder}`}
          className="px-1.5 py-1 mr-1 text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder folder"
        >
          <span className="block w-1 h-3 leading-none text-[10px] tracking-tighter">⋮⋮</span>
        </button>
      </div>
      <TopLevelFolderContent
        topFolder={folder}
        info={info}
        basePath={props.basePath}
        orphanSet={props.orphanSet}
        currentPage={props.currentPage}
        subfolderExpanded={subfolderExpanded}
        onSubfolderToggle={onSubfolderToggle}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Drag preview
// ---------------------------------------------------------------------------

const DragPreview = memo(function DragPreview({ item }: { item: { type: 'page' | 'folder'; page?: FileTreePageItem; folder?: string } }) {
  if (item.type === 'page' && item.page) {
    const Icon = TYPE_ICONS[item.page.type] || FileText;
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded bg-bg-elevated border border-accent shadow-lg">
        <Icon size={12} />
        <span className="truncate max-w-[200px]">{item.page.title}</span>
      </div>
    );
  }
  if (item.type === 'folder' && item.folder) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded bg-bg-elevated border border-accent shadow-lg">
        <Folder size={14} className="text-accent" />
        <span className="font-medium">{item.folder}</span>
      </div>
    );
  }
  return null;
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FileTree({
  pagesByFolder,
  folderOrder,
  currentPage,
  basePath = '/wiki',
  orphanPaths,
  isLoading,
  error,
  onRetry,
  onCreatePage,
  onCreateFolder,
  onReorder,
}: FileTreeProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const lastCommittedRef = useRef<ReorderChange | null>(null);
  const [subfolderExpanded, setSubfolderExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [showDormant, setShowDormant] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const orphanSet = useMemo(() => new Set(orphanPaths || []), [orphanPaths]);

  // Filter out dormant pages unless showDormant is toggled on
  const visiblePagesByFolder = useMemo<Record<string, FileTreePageItem[]>>(() => {
    if (showDormant) return pagesByFolder;
    const filtered: Record<string, FileTreePageItem[]> = {};
    for (const [folder, pages] of Object.entries(pagesByFolder)) {
      const nonDormant = pages.filter((p) => p.status !== "dormant");
      if (nonDormant.length > 0) {
        filtered[folder] = nonDormant;
      }
    }
    return filtered;
  }, [pagesByFolder, showDormant]);

  // Build 2-level hierarchy
  const hierarchy = useMemo(() => buildHierarchy(visiblePagesByFolder), [visiblePagesByFolder]);

  // Flatten pages into a single map for lookup
  const pageByPath = useMemo(() => {
    const map = new Map<string, FileTreePageItem>();
    for (const pages of Object.values(visiblePagesByFolder)) {
      for (const p of pages) {
        map.set(p.path, p);
      }
    }
    return map;
  }, [visiblePagesByFolder]);

  const handleCreateComplete = useCallback(async (type: string, subtype: string | null, title: string) => {
    const typeDef = QUICK_CREATE_TYPES.find((t) => t.type === type);
    if (!typeDef) throw new Error('Unknown type');

    const slug = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '').replace(/-+/g, '_') || `page_${Date.now()}`;

    let pagePath: string;
    if (subtype) {
      pagePath = `${typeDef.folder}/${subtype}s/${slug}.md`;
    } else {
      pagePath = `${typeDef.folder}/${slug}.md`;
    }

    const frontmatter: Record<string, unknown> = {
      title,
      type,
      status: 'draft',
      tags: [],
    };
    if (subtype) {
      frontmatter.subtype = subtype;
    }

    const res = await fetch('/api/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pagePath,
        content: `# ${title}\n\n`,
        frontmatter,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Failed to create page');
    }

    // Navigate to the new page
    const slugPath = pagePath.replace(/\.md$/, '');
    router.push(`/wiki/${slugPath}`);
  }, [router]);

  if (isLoading) {
    return <SkeletonTree />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  const totalPages = Object.values(pagesByFolder).reduce((sum, arr) => sum + arr.length, 0);
  const hasPages = totalPages > 0;

  if (!hasPages) {
    return (
      <>
        <EmptyState onCreatePage={onCreatePage} onCreateFolder={onCreateFolder} />
        <QuickCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreateComplete={handleCreateComplete}
        />
      </>
    );
  }

  const toggleSubfolder = useCallback((subfolderPath: string) => {
    setSubfolderExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(subfolderPath)) next.delete(subfolderPath);
      else next.add(subfolderPath);
      return next;
    });
  }, []);

  // Drag-and-drop handlers

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Cross-subfolder moves are committed on drag end.
    // No local state updates needed during drag.
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !onReorder) return;
    const activeSid = String(active.id);
    const overSid = String(over.id);

    // Folder reorder
    if (activeSid.startsWith('folder:') && overSid.startsWith('folder:')) {
      const oldIndex = folderOrder.indexOf(folderIdToName(activeSid));
      const newIndex = folderOrder.indexOf(folderIdToName(overSid));
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const newFolderOrder = arrayMove(folderOrder, oldIndex, newIndex);
      const change: ReorderChange = { moves: [], folderOrder: newFolderOrder };
      lastCommittedRef.current = change;
      try {
        await onReorder(change);
      } catch {
        // Parent will revert
      }
      return;
    }

    // Page move / reorder
    if (!activeSid.startsWith('page:')) return;

    const activePath = pageIdToPath(activeSid);
    const activePage = pageByPath.get(activePath);
    if (!activePage) return;

    const activeSubfolder = subfolderOf(activePath);
    const activeTopFolder = folderOf(activePath);

    // Determine target subfolder/folder
    let targetTopFolder: string;
    let targetSubfolder: string | null;
    let targetIndex = -1;

    if (overSid.startsWith('subfolder:')) {
      // Dropped on a subfolder header — add to end of that subfolder
      const sfPath = subfolderIdToPath(overSid);
      targetTopFolder = sfPath.split('/')[0];
      targetSubfolder = sfPath;
      // Count pages in the target to get index
      const targetInfo = hierarchy[targetTopFolder];
      if (targetInfo) {
        const sfInfo = targetInfo.subfolders.find((sf) => sf.path === sfPath);
        targetIndex = sfInfo ? sfInfo.pages.length : 0;
      } else {
        targetIndex = 0;
      }
    } else if (overSid.startsWith('folder:')) {
      // Dropped on a top-level folder header — add to top-level (no subfolder)
      targetTopFolder = folderIdToName(overSid);
      targetSubfolder = null;
      targetIndex = pagesByFolder[targetTopFolder]?.length ?? 0;
    } else if (overSid.startsWith('page:')) {
      // Dropped on a page — add next to it
      const overPath = pageIdToPath(overSid);
      const overSubfolder = subfolderOf(overPath);
      const overTopFolder = folderOf(overPath);
      targetTopFolder = overTopFolder;
      targetSubfolder = overSubfolder;

      // Find index within the target subfolder/pages
      if (overSubfolder) {
        const targetInfo = hierarchy[targetTopFolder];
        if (targetInfo) {
          const sfInfo = targetInfo.subfolders.find((sf) => sf.path === overSubfolder);
          targetIndex = sfInfo ? sfInfo.pages.findIndex((p) => p.path === overPath) : -1;
        }
      } else {
        // Over a page directly in the top folder
        const targetInfo = hierarchy[targetTopFolder];
        if (targetInfo) {
          targetIndex = targetInfo.directPages.findIndex((p) => p.path === overPath);
        }
      }
      if (targetIndex >= 0) {
        // Insert after the target page
        targetIndex += 1;
      }
    } else {
      return;
    }

    if (targetIndex < 0) targetIndex = 0;

    // Compute new path
    const filename = activePath.split('/').pop() || '';
    let newPath: string;
    if (targetSubfolder) {
      newPath = `${targetSubfolder}/${filename}`;
    } else {
      newPath = `${targetTopFolder}/${filename}`;
    }

    const change: ReorderChange = {
      moves: [{ oldPath: activePath, newPath, order: targetIndex }],
    };

    // If moving between top-level folders, include current folder order
    if (activeTopFolder !== targetTopFolder) {
      change.folderOrder = folderOrder;
    }

    lastCommittedRef.current = change;
    try {
      await onReorder(change);
    } catch {
      // Parent will revert
    }
  };

  const activeItem = activeId ? findActiveItem(activeId, pageByPath, folderOrder) : null;

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Pages</span>
        <div className="flex items-center gap-0.5">
          {/* Dormant pages toggle */}
          <label
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
            title={showDormant ? "Hide dormant pages" : "Show dormant pages"}
          >
            <input
              type="checkbox"
              checked={showDormant}
              onChange={(e) => setShowDormant(e.target.checked)}
              className="w-2.5 h-2.5 rounded border-border-default accent-accent cursor-pointer"
              aria-label="Show dormant pages"
            />
            <span>Dormant</span>
          </label>
          {onCreateFolder && (
            <button
              onClick={onCreateFolder}
              title="New folder"
              aria-label="New folder"
              className="inline-flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors"
            >
              <FolderPlus size={12} />
            </button>
          )}
          <button
            onClick={() => setCreateOpen(true)}
            title="New page"
            aria-label="New page"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={folderOrder.map(idForFolder)}
          strategy={verticalListSortingStrategy}
        >
          {folderOrder.map((folder) => {
            const info = hierarchy[folder];
            if (!info) return null;
            return (
              <SortableFolderWrapper
                key={folder}
                folder={folder}
                info={info}
                basePath={basePath}
                orphanSet={orphanSet}
                currentPage={currentPage}
                subfolderExpanded={subfolderExpanded}
                onSubfolderToggle={toggleSubfolder}
              />
            );
          })}
        </SortableContext>
        <DragOverlay>
          {activeItem ? <DragPreview item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Quick-create modal */}
      <QuickCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreateComplete={handleCreateComplete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active item resolver
// ---------------------------------------------------------------------------

function findActiveItem(
  id: UniqueIdentifier,
  pageByPath: Map<string, FileTreePageItem>,
  folderOrder: string[],
): { type: 'page' | 'folder'; page?: FileTreePageItem; folder?: string } | null {
  const sid = String(id);
  if (sid.startsWith('page:')) {
    const path = pageIdToPath(sid);
    const page = pageByPath.get(path);
    if (page) return { type: 'page', page };
  } else if (sid.startsWith('folder:')) {
    const name = folderIdToName(sid);
    if (folderOrder.includes(name)) return { type: 'folder', folder: name };
  }
  return null;
}
