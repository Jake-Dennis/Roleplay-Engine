'use client';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { buildLinkGraph } from '@/lib/wiki/wikilinks';
import type { WikiPage } from '@/lib/wiki/file-io';
import type cytoscape from 'cytoscape';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, GitBranch, RefreshCw, Target, Globe, Search, Info, Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const CytoscapeLoadingState = () => (
  <div className="w-full h-full flex items-center justify-center" role="status">
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

// Graphify's color palette
const COMMUNITY_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
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
      setProgress(prev => { if (prev >= 90) return 90; return prev + Math.random() * 15; });
    }, 300);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0f0f1a]" role="status">
      <Loader2 size={32} className="animate-spin text-accent mb-4" />
      <p className="text-sm font-medium text-[#e0e0e0] mb-2">Building graph...</p>
      <div className="w-48 h-1.5 bg-[#2a2a4e] rounded-full overflow-hidden">
        <div className="h-full bg-[#4E79A7] rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-[#666] mt-2">Analyzing connections</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0f0f1a]" role="status">
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-full bg-[#1a1a2e] border border-[#2a2a4e] flex items-center justify-center">
          <GitBranch size={24} className="text-[#555]" />
        </div>
      </div>
      <p className="text-sm font-medium text-[#e0e0e0] mb-1">No connections yet</p>
      <p className="text-xs text-[#666] text-center max-w-xs">Ingest wiki content to build your knowledge graph.</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0f0f1a]" role="alert">
      <AlertTriangle size={20} className="text-[#E15759] mb-3" />
      <p className="text-sm font-medium text-[#e0e0e0] mb-1">Graph failed to render</p>
      <p className="text-xs text-[#666] text-center max-w-xs mb-3">{error}</p>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a2e] border border-[#2a2a4e] text-[#e0e0e0] text-xs font-medium hover:bg-[#2a2a4e] transition-colors">
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

export default function GraphView({ pages, basePath = '/wiki', isLoading, error, onRetry, focusPage }: GraphViewProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [showArrows, setShowArrows] = useState(false);
  const [showCommunityColors, setShowCommunityColors] = useState(true);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set(['entity', 'concept', 'source', 'synthesis']));
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; type: string; community: number; source: string; degree: number; neighbors: Array<{ id: string; label: string; color: string }> } | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; label: string; color: string }>>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [hiddenCommunities, setHiddenCommunities] = useState<Set<number>>(new Set());
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [stabilized, setStabilized] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
  const { graph, nodeDegrees, communities, allNodeIds, maxDegree, isLocalGraph, communityLabels, communityCounts } = useMemo(() => {
    const g = buildLinkGraph(pages);
    const degrees = computeDegrees(g.edges);
    const ids = pages.map(p => p.path);
    const comms = detectCommunities(g.edges, ids);

    let maxDeg = 1;
    for (const d of degrees.values()) maxDeg = Math.max(maxDeg, d);

    // Count members per community
    const counts = new Map<number, number>();
    for (const page of pages) {
      const c = comms.get(page.path) ?? 0;
      counts.set(c, (counts.get(c) || 0) + 1);
    }

    // Generate community labels
    const labels = new Map<number, string>();
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    sorted.forEach(([cid], i) => {
      labels.set(cid, `Community ${i + 1}`);
    });

    return {
      graph: g,
      nodeDegrees: degrees,
      communities: comms,
      allNodeIds: ids,
      maxDegree: maxDeg,
      isLocalGraph: false,
      communityLabels: labels,
      communityCounts: counts,
    };
  }, [pages]);

  // Build elements for cytoscape
  const elements = useMemo(() => {
    const maxDeg = Math.max(1, maxDegree);

    return [
      ...pages.map(page => {
        const degree = nodeDegrees.get(page.path) || 0;
        const cid = communities.get(page.path) ?? 0;
        const color = showCommunityColors
          ? COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]
          : '#4E79A7';
        const size = 10 + 30 * (degree / maxDeg);
        // Only show labels for high-degree nodes (like graphify)
        const showLabel = degree >= maxDeg * 0.15;

        return {
          data: {
            id: page.path,
            label: page.frontmatter.title || page.path.split('/').pop()?.replace('.md', '') || page.path,
            type: page.frontmatter.type || 'entity',
            community: cid,
            communityLabel: communityLabels.get(cid) || `Community ${cid}`,
            degree,
            size: Math.max(10, Math.min(40, size)),
            color,
            sourceFile: page.path,
            isFocus: page.path === focusPage,
            showLabel,
          },
        };
      }),
      ...graph.edges.map(edge => ({
        data: { source: edge.source, target: edge.target },
      })),
    ];
  }, [pages, graph.edges, nodeDegrees, communities, maxDegree, focusPage, showCommunityColors, communityLabels]);

  // Apply styles and filters to cytoscape
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Apply hidden communities filter
    cy.nodes().forEach((node) => {
      const d = node.data();
      const communityId = d.community;
      const isHidden = hiddenCommunities.has(communityId);
      const matchesType = filterTypes.has(d.type);
      const matchesText = !searchText || (d.label || '').toLowerCase().includes(searchText.toLowerCase());
      const visible = !isHidden && matchesType && matchesText;

      node.style('opacity', visible ? 1 : 0.08);
      node.style('display', 'element');
      node.style('width', d.size);
      node.style('height', d.size);
      node.style('background-color', d.color);
      node.style('shape', 'ellipse');
      node.style('border-width', d.isFocus ? 2.5 : 0);
      node.style('border-color', '#ffffff');
      node.style('border-opacity', d.isFocus ? 0.9 : 0);
      node.style('shadow-blur', 6);
      node.style('shadow-color', '#000');
      node.style('shadow-opacity', 0.4);
      node.style('shadow-offset-x', 0);
      node.style('shadow-offset-y', 2);

      // Like graphify: show label only for important nodes, or if explicitly toggled
      if (showLabels && (d.showLabel || d.isFocus || selectedNode?.id === node.id())) {
        node.style('label', 'data(label)');
        node.style('font-size', '10px');
        node.style('text-valign', 'bottom');
        node.style('text-halign', 'center');
        node.style('color', '#e0e0e0');
        node.style('text-outline-width', 2);
        node.style('text-outline-color', '#0f0f1a');
      } else {
        node.style('label', '');
      }
    });

    // Edge styles
    cy.edges().forEach((edge) => {
      const src = edge.source();
      const tgt = edge.target();
      const srcVisible = src.style('opacity') >= 0.5;
      const tgtVisible = tgt.style('opacity') >= 0.5;
      edge.style('opacity', srcVisible && tgtVisible ? 0.5 : 0.02);
      edge.style('width', 1.5);
      edge.style('line-color', '#4b5563');
      edge.style('target-arrow-color', '#9ca3af');
      edge.style('target-arrow-shape', showArrows ? 'triangle' : 'none');
      edge.style('curve-style', 'bezier');
    });
  }, [filterTypes, searchText, showLabels, showArrows, hiddenCommunities, selectedNode, elements]);

  // Stabilize physics after initialization (like graphify)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || stabilized) return;
    
    const timeout = setTimeout(() => {
      setStabilized(true);
      setPhysicsEnabled(false);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [stabilized]);

  // Search autocomplete
  useEffect(() => {
    if (!searchText.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    const q = searchText.toLowerCase();
    const matches = pages
      .map(p => ({
        id: p.path,
        label: p.frontmatter.title || p.path.split('/').pop()?.replace('.md', '') || p.path,
        color: COMMUNITY_COLORS[(communities.get(p.path) ?? 0) % COMMUNITY_COLORS.length],
      }))
      .filter(n => n.label.toLowerCase().includes(q))
      .slice(0, 20);
    setSearchResults(matches);
    setShowSearchResults(matches.length > 0);
  }, [searchText, pages, communities]);

  // Click outside search results to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleType = (type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const focusNode = useCallback((nodeId: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(cy.getElementById(nodeId), 40);
    cy.nodes().forEach(n => { n.style('border-width', n.id() === nodeId ? 2.5 : 0); });
    const node = cy.getElementById(nodeId);
    node.style('border-width', 2.5);
    node.style('border-color', '#ffffff');
    node.style('border-opacity', 0.9);
  }, []);

  const handleTap = useCallback((event: { target: () => { isNode: () => boolean; id: () => string; isEdge: () => boolean } }) => {
    const target = event.target();
    if (target.isNode()) {
      const nodeId = target.id();
      const page = pages.find(p => p.path === nodeId);
      const label = page?.frontmatter.title || nodeId.split('/').pop()?.replace('.md', '') || nodeId;
      const degree = nodeDegrees.get(nodeId) || 0;
      const community = communities.get(nodeId) ?? 0;
      
      // Show info panel (like graphify)
      const cy = cyRef.current;
      const neighborNodes: Array<{ id: string; label: string; color: string }> = [];
      if (cy) {
        const ns = cy.getElementById(nodeId).neighborhood();
        for (let i = 0; i < ns.length; i++) {
          const n = ns[i];
          if (n.id() !== nodeId) {
            neighborNodes.push({
              id: n.id(),
              label: (n as any).data('label') || n.id(),
              color: (n as any).data('color') || '#555',
            });
          }
        }
      }

      setSelectedNode({
        id: nodeId,
        label,
        type: page?.frontmatter.type || 'unknown',
        community,
        source: page?.path || '',
        degree,
        neighbors: neighborNodes.slice(0, 30),
      });

      // Focus the node
      focusNode(nodeId);
    } else if (!target.isEdge() && !(event as any).originalEvent?.target?.closest?.('#sidebar')) {
      setSelectedNode(null);
    }
  }, [pages, focusNode]);

  const handleSearchSelect = (nodeId: string) => {
    setShowSearchResults(false);
    setSearchText('');
    const cy = cyRef.current;
    if (cy) {
      const node = cy.getElementById(nodeId);
      if (node.length > 0) handleTap({ target: () => ({ isNode: () => true, id: () => nodeId, isEdge: () => false }) });
    }
  };

  const toggleCommunity = (cid: number) => {
    setHiddenCommunities(prev => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  };

  const toggleAllCommunities = (hide: boolean) => {
    if (hide) {
      const all = new Set(communityCounts.keys());
      setHiddenCommunities(all);
    } else {
      setHiddenCommunities(new Set());
    }
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

  const allHidden = hiddenCommunities.size === communityCounts.size;
  const someHidden = hiddenCommunities.size > 0 && hiddenCommunities.size < communityCounts.size;

  return (
    <div className="flex h-full" style={{ background: '#0f0f1a' }}>
      {/* Graph canvas */}
      <div className="flex-1 relative">
        <CytoscapeComponent
          elements={elements}
          layout={{
            name: 'cose',
            animate: true,
            animationDuration: 500,
            padding: 50,
            idealEdgeLength: 180,
            nodeRepulsion: 150000,
            gravity: 0.05,
            numIter: 1000,
            nodeOverlap: 20,
          }}
          style={{ width: '100%', height: '100%' }}
          cy={(cy) => {
            cyRef.current = cy;
            cy.fit(cy.nodes(), 40);
            // Bind tap event - use proper typing
            cy.on('tap', function(this: cytoscape.Core, e: cytoscape.EventObject) {
              if (e.target === this) {
                setSelectedNode(null);
              }
            });
          }}
          stylesheet={[
            {
              selector: 'node',
              style: {
                'background-color': '#4E79A7',
                'label': '',
                'font-size': '10px',
                'text-valign': 'bottom',
                'text-halign': 'center',
                'width': 20,
                'height': 20,
                'color': '#e0e0e0',
                'text-outline-width': 2,
                'text-outline-color': '#0f0f1a',
                'shadow-blur': 6,
                'shadow-color': '#000',
                'shadow-opacity': 0.4,
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

      {/* Sidebar — like graphify */}
      <div id="sidebar" className="w-72 flex flex-col overflow-hidden border-l border-[#2a2a4e]" style={{ background: '#1a1a2e' }}>
        {/* Search */}
        <div className="relative" ref={searchRef}>
          <div className="p-3 border-b border-[#2a2a4e]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-md border border-[#3a3a5e] bg-[#0f0f1a] text-[#e0e0e0] placeholder:text-[#555] outline-none focus:border-[#4E79A7]"
                onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
              />
            </div>
          </div>
          {/* Search results dropdown */}
          {showSearchResults && (
            <div className="absolute top-full left-3 right-3 z-10 max-h-40 overflow-y-auto border border-[#3a3a5e] rounded-md bg-[#1a1a2e] shadow-lg" style={{ marginTop: '-1px' }}>
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[#2a2a4e] text-[#e0e0e0]"
                  style={{ borderLeft: `3px solid ${r.color}` }}
                  onMouseDown={() => handleSearchSelect(r.id)}
                >
                  <span className="truncate">{r.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info panel — like graphify's click-to-inspect */}
        <div className="p-3 border-b border-[#2a2a4e] min-h-[120px]">
          <h3 className="text-xs text-[#555] uppercase tracking-wider font-semibold mb-2">Node Info</h3>
          {selectedNode ? (
            <div className="space-y-1 text-xs text-[#ccc]">
              <div className="text-sm font-medium text-[#e0e0e0] truncate">{selectedNode.label}</div>
              <div className="flex gap-2">
                <span className="text-[#555]">Type:</span>
                <span className="capitalize">{selectedNode.type}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#555]">Community:</span>
                <span>{communityLabels.get(selectedNode.community) || `Community ${selectedNode.community + 1}`}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#555]">Degree:</span>
                <span>{selectedNode.degree}</span>
              </div>
              {selectedNode.neighbors.length > 0 && (
                <div className="mt-2">
                  <div className="text-[#555] mb-1">Neighbors ({selectedNode.neighbors.length})</div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {selectedNode.neighbors.map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer hover:bg-[#2a2a4e] text-xs truncate"
                        style={{ borderLeft: `3px solid ${n.color}` }}
                        onMouseDown={(e) => { e.stopPropagation(); handleSearchSelect(n.id); }}
                      >
                        {n.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-[#555] italic">Click a node to inspect it</div>
          )}
        </div>

        {/* Controls */}
        <div className="p-3 border-b border-[#2a2a4e] space-y-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-[#aaa] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded border-[#3a3a5e] bg-[#0f0f1a] text-[#4E79A7] focus:ring-[#4E79A7]/30"
                style={{ appearance: 'none', width: 14, height: 14, border: '1.5px solid #3a3a5e', borderRadius: 3, background: '#0f0f1a', cursor: 'pointer', position: 'relative' }}
              />
              <span>Labels</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#aaa] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArrows}
                onChange={(e) => setShowArrows(e.target.checked)}
                className="rounded border-[#3a3a5e] bg-[#0f0f1a] text-[#4E79A7] focus:ring-[#4E79A7]/30"
                style={{ appearance: 'none', width: 14, height: 14, border: '1.5px solid #3a3a5e', borderRadius: 3, background: '#0f0f1a', cursor: 'pointer', position: 'relative' }}
              />
              <span>Arrows</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#aaa] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCommunityColors}
                onChange={(e) => setShowCommunityColors(e.target.checked)}
                className="rounded border-[#3a3a5e] bg-[#0f0f1a] text-[#4E79A7] focus:ring-[#4E79A7]/30"
                style={{ appearance: 'none', width: 14, height: 14, border: '1.5px solid #3a3a5e', borderRadius: 3, background: '#0f0f1a', cursor: 'pointer', position: 'relative' }}
              />
              <span>Colors</span>
            </label>
          </div>
        </div>

        {/* Community legend — like graphify */}
        <div className="flex-1 overflow-y-auto p-3 border-b border-[#2a2a4e]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs text-[#555] uppercase tracking-wider font-semibold">Communities</h3>
            <label className="flex items-center gap-1 text-xs text-[#aaa] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!allHidden}
                ref={(el) => { if (el) el.indeterminate = someHidden; }}
                onChange={(e) => toggleAllCommunities(!e.target.checked)}
                style={{ appearance: 'none', width: 14, height: 14, border: '1.5px solid #3a3a5e', borderRadius: 3, background: allHidden ? '#0f0f1a' : '#4E79A7', cursor: 'pointer', position: 'relative' }}
              />
              {allHidden ? 'None' : someHidden ? 'Some' : 'All'}
            </label>
          </div>
          <div className="space-y-0.5">
            {[...communityCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([cid, count]) => {
              const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length];
              const label = communityLabels.get(cid) || `Community ${cid + 1}`;
              const isHidden = hiddenCommunities.has(cid);
              return (
                <div
                  key={cid}
                  className={`flex items-center gap-2 px-1 py-1 rounded cursor-pointer text-xs ${isHidden ? 'opacity-35' : ''} hover:bg-[#2a2a4e]`}
                  onClick={() => toggleCommunity(cid)}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                  <span className="flex-1 text-[#e0e0e0] truncate">{label}</span>
                  <span className="text-[#555] text-xs">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats footer — like graphify */}
        <div className="p-3 text-xs text-[#555] border-t border-[#2a2a4e] flex justify-between">
          <span>{pages.length} nodes</span>
          <span>{graph.edges.length} edges</span>
          <span>{communityCounts.size} communities</span>
        </div>

        {/* Zoom controls */}
        <div className="p-2 border-t border-[#2a2a4e] flex justify-center gap-2">
          <button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom(cy.zoom() * 1.3); }}
            className="p-1.5 rounded hover:bg-[#2a2a4e] text-[#555] hover:text-[#e0e0e0] transition-colors">
            <ZoomIn size={14} />
          </button>
          <button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom(cy.zoom() / 1.3); }}
            className="p-1.5 rounded hover:bg-[#2a2a4e] text-[#555] hover:text-[#e0e0e0] transition-colors">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => { const cy = cyRef.current; if (cy) cy.fit(cy.nodes(), 30); }}
            className="p-1.5 rounded hover:bg-[#2a2a4e] text-[#555] hover:text-[#e0e0e0] transition-colors">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
