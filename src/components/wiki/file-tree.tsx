'use client';
import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
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
import { Folder, FileText, ChevronRight, ChevronDown, Users, BookOpen, FileText as FileIcon, GitBranch, Plus, AlertTriangle, RefreshCw, FolderPlus } from 'lucide-react';

export interface FileTreePageItem {
  path: string;          // relative path e.g. "entities/foo.md"
  title: string;
  type: string;
  order?: number;
}

export interface ReorderChange {
  moves: Array<{ oldPath: string; newPath: string; order?: number }>;
  folderOrder?: string[];
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
  onCreatePage?: () => void;
  onCreateFolder?: () => void;
  onReorder?: (change: ReorderChange) => Promise<void>;
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  entity: Users,
  concept: BookOpen,
  source: FileIcon,
  synthesis: GitBranch,
};

const folderOf = (path: string) => path.includes('/') ? path.split('/')[0] : '';
const pathOf = (folder: string, filename: string) => `${folder}/${filename.replace(/\.md$/, '')}.md`;
const idForPage = (path: string) => `page:${path}`;
const idForFolder = (name: string) => `folder:${name}`;
const pageIdToPath = (id: string) => id.startsWith('page:') ? id.slice(5) : '';
const folderIdToName = (id: string) => id.startsWith('folder:') ? id.slice(7) : '';

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

// --- Sortable bits --------------------------------------------------------

function SortablePageRow({
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
  } = useSortable({ id: idForPage(page.path), data: { type: 'page', folder: folderOf(page.path) } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = TYPE_ICONS[page.type] || FileText;
  const folder = folderOf(page.path);
  const slug = page.path.split('/').pop()?.replace(/\.md$/, '').replace(/_/g, '-') || '';

  // When dragging the original item, dim it; the overlay is the visible ghost
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
}

function SortableFolderSection({
  folder,
  pages,
  basePath,
  orphanSet,
  currentPage,
  isExpanded,
  onToggle,
  isFolderDragging,
  dragHandleProps,
  dragHandleAttributes,
}: {
  folder: string;
  pages: FileTreePageItem[];
  basePath: string;
  orphanSet: Set<string>;
  currentPage?: string;
  isExpanded: boolean;
  onToggle: () => void;
  isFolderDragging: boolean;
  dragHandleProps?: Record<string, unknown>;
  dragHandleAttributes?: Record<string, unknown>;
}) {
  return (
    <div className={isFolderDragging ? 'opacity-50' : ''}>
      <div className="flex items-center">
        <button
          onClick={(e) => {
            e.preventDefault();
            onToggle();
          }}
          className="flex items-center gap-1 flex-1 px-2 py-1 hover:bg-bg-raised rounded text-left"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} className="text-accent" />
          <span className="font-medium">{folder}</span>
          <span className="text-xxs text-text-muted ml-1">({pages.length})</span>
        </button>
        <button
          {...(dragHandleProps ?? {})}
          {...(dragHandleAttributes ?? {})}
          aria-label={`Drag to reorder folder ${folder}`}
          className="px-1.5 py-1 mr-1 text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder folder"
        >
          <span className="block w-1 h-3 leading-none text-[10px] tracking-tighter">⋮⋮</span>
        </button>
      </div>
      {isExpanded && (
        <div className="ml-4">
          <SortableContext
            items={pages.map((p) => idForPage(p.path))}
            strategy={verticalListSortingStrategy}
          >
            {pages.map((p) => (
              <SortablePageRow
                key={p.path}
                page={p}
                basePath={basePath}
                isActive={p.path === currentPage}
                isOrphan={orphanSet.has(p.path)}
              />
            ))}
            {pages.length === 0 && (
              <div className="text-xxs text-text-muted px-2 py-1 italic">
                Drop pages here
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

// --- Main component -------------------------------------------------------

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
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(folderOrder.length > 0 ? folderOrder : []),
  );
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const lastCommittedRef = useRef<ReorderChange | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const orphanSet = useMemo(() => new Set(orphanPaths || []), [orphanPaths]);

  // Flatten pages into a single map for lookup
  const pageByPath = useMemo(() => {
    const map = new Map<string, FileTreePageItem>();
    for (const folder of Object.keys(pagesByFolder)) {
      for (const p of pagesByFolder[folder]) {
        map.set(p.path, p);
      }
    }
    return map;
  }, [pagesByFolder]);

  if (isLoading) {
    return <SkeletonTree />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  const totalPages = Object.values(pagesByFolder).reduce((sum, arr) => sum + arr.length, 0);
  const hasPages = totalPages > 0;

  if (!hasPages) {
    return <EmptyState onCreatePage={onCreatePage} onCreateFolder={onCreateFolder} />;
  }

  const toggle = (folder: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  // Find which container (folder) a sortable id belongs to
  const findContainer = (id: UniqueIdentifier): string | null => {
    const sid = String(id);
    if (sid.startsWith('folder:')) return null; // folder headers aren't in a page container
    if (sid.startsWith('page:')) {
      const path = pageIdToPath(sid);
      return folderOf(path);
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeSid = String(active.id);
    const overSid = String(over.id);

    // Only pages can move between folders; folders stay in the folder list
    if (activeSid.startsWith('folder:')) return;

    const activeContainer = findContainer(active.id);
    let overContainer = findContainer(over.id);

    // If hovering over a folder header, treat the folder as the target container
    if (overSid.startsWith('folder:')) {
      overContainer = folderIdToName(overSid);
    }

    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    // Cross-container move: update the local view by remapping
    // The actual reorder is committed on drag end
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
        // Parent will revert; nothing to do here
      }
      return;
    }

    // Page move / reorder
    if (!activeSid.startsWith('page:')) return;

    const activePath = pageIdToPath(activeSid);
    const activeFolder = folderOf(activePath);
    let targetFolder = activeFolder;
    let targetIndex = -1;

    if (overSid.startsWith('folder:')) {
      targetFolder = folderIdToName(overSid);
      targetIndex = (pagesByFolder[targetFolder]?.length ?? 0);
    } else if (overSid.startsWith('page:')) {
      const overPath = pageIdToPath(overSid);
      targetFolder = folderOf(overPath);
      targetIndex = pagesByFolder[targetFolder]?.findIndex((p) => p.path === overPath) ?? -1;
    } else {
      return;
    }

    if (targetIndex === -1) return;

    // Compute new path and order
    const oldIndex = pagesByFolder[activeFolder]?.findIndex((p) => p.path === activePath) ?? -1;
    if (oldIndex === -1) return;

    const filename = activePath.split('/').pop() || '';
    const newPath = pathOf(targetFolder, filename);
    const order = targetIndex;

    const change: ReorderChange = {
      moves: [{ oldPath: activePath, newPath, order }],
    };
    if (activeFolder !== targetFolder) {
      change.folderOrder = folderOrder; // keep order, no change
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
        <span className="text-xxs font-semibold uppercase tracking-wider text-text-muted">Pages</span>
        <div className="flex items-center gap-0.5">
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
          {onCreatePage && (
            <button
              onClick={onCreatePage}
              title="New page"
              aria-label="New page"
              className="inline-flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors"
            >
              <Plus size={12} />
            </button>
          )}
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
            const pages = pagesByFolder[folder] || [];
            const isExpanded = expanded.has(folder);
            return (
              <SortableFolderWrapper
                key={folder}
                folder={folder}
                pages={pages}
                basePath={basePath}
                orphanSet={orphanSet}
                currentPage={currentPage}
                isExpanded={isExpanded}
                onToggle={() => toggle(folder)}
              />
            );
          })}
        </SortableContext>
        <DragOverlay>
          {activeItem ? <DragPreview item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

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

function DragPreview({ item }: { item: { type: 'page' | 'folder'; page?: FileTreePageItem; folder?: string } }) {
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
}

// Wrapper that connects folder sortable + child sortable context
function SortableFolderWrapper(props: {
  folder: string;
  pages: FileTreePageItem[];
  basePath: string;
  orphanSet: Set<string>;
  currentPage?: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { folder, pages, isExpanded, onToggle } = props;
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

  return (
    <div ref={setNodeRef} style={style}>
      <SortableFolderSection
        folder={folder}
        pages={pages}
        basePath={props.basePath}
        orphanSet={props.orphanSet}
        currentPage={props.currentPage}
        isExpanded={isExpanded}
        onToggle={onToggle}
        dragHandleProps={listeners as unknown as Record<string, unknown>}
        dragHandleAttributes={attributes as unknown as Record<string, unknown>}
        isFolderDragging={isDragging}
      />
    </div>
  );
}
