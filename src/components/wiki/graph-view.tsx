'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { buildLinkGraph } from '@/lib/wiki/wikilinks';
import type { WikiPage } from '@/lib/wiki/file-io';
import type cytoscape from 'cytoscape';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, GitBranch, RefreshCw, Target, Globe } from 'lucide-react';

const CytoscapeLoadingState = () => (
  <div className="w-full h-full flex items-center justify-center" role="status" aria-label="Loading graph visualization">
    <Loader2 size={24} className="animate-spin text-accent" />
  </div>
);

const CytoscapeComponent = dynamic(() => import('react-cytoscapejs'), {
  ssr: false,
  loading: () => <CytoscapeLoadingState />,
});

interface GraphViewProps {
  pages: WikiPage[];
  basePath?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  focusPage?: string | null;
}

// Type-based colors (fallback when community colors are off)
const TYPE_COLORS: Record<string, string> = {
  entity: '#3b82f6',
  concept: '#22c55e',
  source: '#f97316',
  synthesis: '#a855f7',
};

// Node shapes by type (like Obsidian: circles, diamonds, squares, triangles)
const NODE_SHAPES: Record<string, string> = {
  entity: 'ellipse',
  concept: 'diamond',
  source: 'round-rectangle',
  synthesis: 'triangle',
};

// Palette for community colors
const COMMUNITY_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
  '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#f59e0b',
  '#6366f1', '#84cc16', '#d946ef', '#0ea5e9', '#f43f5e',
];

// Detect communities via connected components
function detectCommunities(edges: Array<{ source: string; target: string }>, allNodeIds: string[]): Map<string, number> {
  const adj = new Map<string, Set<string>>();
  for (const id of allNodeIds) adj.set(id, new Set());
  for (const edge of edges) {
    adj.get(edge.source)?.add(edge.target);
    adj.get(edge.target)?.add(edge.source);
  }

  const community = new Map<string, number>();
  let nextId = 0;

  for (const node of allNodeIds) {
    if (community.has(node)) continue;
    // BFS
    const queue = [node];
    community.set(node, nextId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adj.get(current) || []) {
        if (!community.has(neighbor)) {
          community.set(neighbor, nextId);
          queue.push(neighbor);
        }
      }
    }
    nextId++;
  }

  return community;
}

// Compute node degree (connection count)
function computeDegrees(edges: Array<{ source: string; target: string }>): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
  }
  return degrees;
}

function LoadingState() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        return prev + Math.random() * 15;
      });
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center" role="status" aria-label="Building graph">
      <div className="relative mb-4">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
      <p className="text-sm font-medium text-text-primary mb-2">Building graph...</p>
      <div className="w-48 h-1.5 bg-bg-highlight rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-text-muted mt-2">Analyzing connections</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center" role="status" aria-label="No connections yet">
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
          <GitBranch size={24} className="text-text-muted" />
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent/30" />
        <div className="absolute -bottom-1 -left-2 w-2 h-2 rounded-full bg-accent/20" />
        <div className="absolute top-2 -left-3 w-2 h-2 rounded-full bg-accent/15" />
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">No connections yet</p>
      <p className="text-xs text-text-muted text-center max-w-xs">Ingest source material to build your knowledge graph.</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center" role="alert" aria-label="Graph failed to render">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
          <AlertTriangle size={20} className="text-error" />
        </div>
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">Graph failed to render</p>
      <p className="text-xs text-text-muted text-center max-w-xs mb-3">{error}</p>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-raised border border-border-default text-text-primary text-xs font-medium hover:bg-bg-highlight transition-colors">
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}

export default function GraphView({ pages, basePath = '/wiki', isLoading, error, onRetry, focusPage }: GraphViewProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const router = useRouter();
  const [filterText, setFilterText] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [showArrows, setShowArrows] = useState(false);
  const [showCommunityColors, setShowCommunityColors] = useState(true);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set(['entity', 'concept', 'source', 'synthesis']));
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  // Compute type counts
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const page of pages) {
      const t = page.frontmatter.type || 'entity';
      counts[t] = (counts[t] || 0) + 1;
    }
    setTypeCounts(counts);
  }, [pages]);

  // Build graph data
  const { graph, nodeDegrees, communities, allNodeIds, isLocalGraph } = useMemo(() => {
    const g = buildLinkGraph(pages);
    const ids = pages.map(p => p.path);
    const degrees = computeDegrees(g.edges);
    const comms = detectCommunities(g.edges, ids);

    // If focusPage is set, filter to local subgraph (focus + 1-hop neighbors)
    let localMode = false;
    let activeEdges = g.edges;
    let activeIds = new Set(ids);

    if (focusPage && ids.includes(focusPage)) {
      localMode = true;
      const neighbors = new Set<string>([focusPage]);
      for (const edge of g.edges) {
        if (edge.source === focusPage) neighbors.add(edge.target);
        if (edge.target === focusPage) neighbors.add(edge.source);
      }
      activeIds = neighbors;
      activeEdges = g.edges.filter(e => activeIds.has(e.source) && activeIds.has(e.target));
    }

    return {
      graph: g,
      nodeDegrees: degrees,
      communities: comms,
      allNodeIds: ids,
      isLocalGraph: localMode,
    };
  }, [pages, focusPage]);

  const elements = useMemo(() => {
    let activeIds = new Set(allNodeIds);
    let activeEdges = graph.edges;

    if (focusPage && allNodeIds.includes(focusPage)) {
      const neighbors = new Set<string>([focusPage]);
      for (const edge of graph.edges) {
        if (edge.source === focusPage) neighbors.add(edge.target);
        if (edge.target === focusPage) neighbors.add(edge.source);
      }
      activeIds = neighbors;
      activeEdges = graph.edges.filter(e => activeIds.has(e.source) && activeIds.has(e.target));
    }

    const maxDegree = Math.max(1, ...Array.from(nodeDegrees.values()));
    const pagesWithDegrees = pages.filter(p => activeIds.has(p.path));

    return [
      ...pagesWithDegrees.map(page => {
        const degree = nodeDegrees.get(page.path) || 0;
        const size = 15 + (degree / maxDegree) * 25; // 15-40px based on connections
        const communityIdx = communities.get(page.path) ?? 0;
        const nodeColor = showCommunityColors
          ? COMMUNITY_COLORS[communityIdx % COMMUNITY_COLORS.length]
          : TYPE_COLORS[page.frontmatter.type || 'entity'] || '#6b7280';

        return {
          data: {
            id: page.path,
            label: page.frontmatter.title || page.path.split('/').pop()?.replace('.md', ''),
            type: page.frontmatter.type || 'entity',
            communityIdx,
            degree,
            color: nodeColor,
            size,
            shape: NODE_SHAPES[page.frontmatter.type || 'entity'] || 'ellipse',
            isFocus: page.path === focusPage,
          },
        };
      }),
      ...activeEdges.map(edge => ({
        data: { source: edge.source, target: edge.target },
      })),
    ];
  }, [pages, graph.edges, nodeDegrees, communities, focusPage, showCommunityColors]);

  // Apply filters and styles to cytoscape
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Apply node styles
    cy.nodes().forEach((node) => {
      const d = node.data();
      const matchesType = filterTypes.has(d.type);
      const matchesText = !filterText || (d.label || '').toLowerCase().includes(filterText.toLowerCase());
      const visible = matchesType && matchesText;

      node.style('opacity', visible ? 1 : 0.15);
      node.style('display', 'element');
      node.style('label', showLabels ? 'data(label)' : '');
      node.style('width', d.size);
      node.style('height', d.size);
      node.style('background-color', d.color);
      node.style('shape', d.shape);

      // Highlight the focus node
      if (d.isFocus) {
        node.style('border-width', 3);
        node.style('border-color', '#ffffff');
        node.style('border-opacity', 0.8);
      } else {
        node.style('border-width', 0);
      }
    });

    // Edge styles
    cy.edges().forEach((edge) => {
      const srcVisible = edge.source().style('opacity') >= 1;
      const tgtVisible = edge.target().style('opacity') >= 1;
      edge.style('opacity', srcVisible && tgtVisible ? 0.6 : 0.05);
      edge.style('target-arrow-shape', showArrows ? 'triangle' : 'none');
    });
  }, [filterTypes, filterText, showLabels, showArrows, elements]);

  const toggleType = (type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (pages.length === 0) return <EmptyState />;

  const typeToFolder: Record<string, string> = {
    entity: 'entities',
    concept: 'concepts',
    source: 'sources',
    synthesis: 'synthesis',
  };

  const handleTap = (event: { target: () => { isNode: () => boolean; id: () => string } }) => {
    const target = event.target();
    if (target.isNode()) {
      const nodeId = target.id();
      const page = pages.find(p => p.path === nodeId);
      if (page) {
        const folderName = typeToFolder[page.frontmatter.type] || page.frontmatter.type;
        router.push(`${basePath}/${folderName}/${page.path.split('/').pop()?.replace('.md', '')}`);
      }
    }
  };

  return (
    <div className="flex h-full">
      {/* Graph sidebar */}
      <div className="w-56 border-r border-border-default p-3 overflow-y-auto shrink-0 flex flex-col gap-3">
        {/* Search */}
        <div>
          <input
            type="text"
            placeholder="Filter nodes..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border-default bg-bg-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Local graph indicator */}
        {isLocalGraph && (
          <div className="flex items-center gap-1.5 text-xxs text-accent font-medium bg-accent/10 rounded px-2 py-1">
            <Target size={12} />
            Local graph — showing connections for selected page
          </div>
        )}

        {/* Show labels toggle */}
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="rounded border-border-default bg-bg-raised text-accent focus:ring-accent/30" />
          Show labels
        </label>

        {/* Show arrows toggle */}
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} className="rounded border-border-default bg-bg-raised text-accent focus:ring-accent/30" />
          Show arrows
        </label>

        {/* Color mode toggle */}
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input type="checkbox" checked={showCommunityColors} onChange={(e) => setShowCommunityColors(e.target.checked)} className="rounded border-border-default bg-bg-raised text-accent focus:ring-accent/30" />
          Color by groups
        </label>

        {/* Node type legend */}
        <div className="space-y-1">
          <p className="text-xxs text-text-muted uppercase tracking-wider font-medium">Node Types</p>
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <label key={type} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
              <input type="checkbox" checked={filterTypes.has(type)} onChange={() => toggleType(type)} className="rounded border-border-default bg-bg-raised text-accent focus:ring-accent/30" />
              <div className="h-2.5 w-2.5 shrink-0" style={{
                backgroundColor: color,
                borderRadius: type === 'entity' ? '50%' : type === 'concept' ? '2px' : type === 'source' ? '3px' : '0',
                transform: type === 'concept' ? 'rotate(45deg)' : type === 'synthesis' ? 'scaleY(0.8)' : '',
              }} />
              <span className="text-text-primary capitalize flex-1">{type}</span>
              <span className="text-text-muted tabular-nums">{typeCounts[type] || 0}</span>
            </label>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-auto pt-3 border-t border-border-default space-y-1.5">
          <button onClick={() => { const cy = cyRef.current; if (cy) cy.fit(cy.nodes(), 30); }}
            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-bg-raised border border-border-default text-text-muted hover:text-text-primary hover:border-text-muted transition-colors">
            Reset view
          </button>
          <button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom(cy.zoom() * 1.3); }}
            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-bg-raised border border-border-default text-text-muted hover:text-text-primary hover:border-text-muted transition-colors">
            Zoom in
          </button>
          <button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom(cy.zoom() / 1.3); }}
            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-bg-raised border border-border-default text-text-muted hover:text-text-primary hover:border-text-muted transition-colors">
            Zoom out
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative bg-[#111]">
        <CytoscapeComponent
          elements={elements}
          layout={{
            name: 'cose',
            animate: true,
            animationDuration: 500,
            padding: 30,
            idealEdgeLength: 120,
            nodeRepulsion: 8000,
            gravity: 0.25,
            numIter: 1000,
          }}
          style={{ width: '100%', height: '100%' }}
          cy={(cy) => { cyRef.current = cy; cy.fit(cy.nodes(), 30); }}
          stylesheet={[
            {
              selector: 'node',
              style: {
                'background-color': '#3b82f6',
                'label': 'data(label)',
                'font-size': '10px',
                'text-valign': 'bottom',
                'text-halign': 'center',
                'width': 20,
                'height': 20,
                'color': '#e8e8e8',
                'text-outline-width': 2,
                'text-outline-color': '#111',
                'shadow-blur': 8,
                'shadow-color': '#000',
                'shadow-opacity': 0.5,
                'shadow-offset-x': 0,
                'shadow-offset-y': 2,
              },
            },
            {
              selector: 'edge',
              style: {
                'width': 1.5,
                'line-color': '#4b5563',
                'target-arrow-color': '#9ca3af',
                'target-arrow-shape': 'none',
                'curve-style': 'bezier',
              },
            },
          ]}
          tap={handleTap}
        />
      </div>
    </div>
  );
}
