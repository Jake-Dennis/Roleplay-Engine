'use client';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { buildLinkGraph } from '@/lib/wiki/wikilinks';
import type { WikiPage } from '@/lib/wiki/file-io';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, GitBranch, RefreshCw, Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// vis-network is vanilla JS — import dynamically
let visNetworkLib: typeof import('vis-network') | null = null;
let visDataLib: typeof import('vis-data') | null = null;

interface GraphViewProps {
  pages: WikiPage[];
  basePath?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  focusPage?: string | null;
  onPageSelect?: (path: string) => void;
}

// Graphify's color palette
const COMMUNITY_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
];

// Detect communities via connected components (same as Graphify)
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

export default function GraphView({ pages, basePath = '/wiki', isLoading, error, onRetry, focusPage, onPageSelect }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<any>(null);
  const nodesDSRef = useRef<any>(null);
  const edgesDSRef = useRef<any>(null);
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [showCommunityColors, setShowCommunityColors] = useState(true);
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; type: string; community: number; communityName: string; source: string; degree: number; neighbors: Array<{ id: string; label: string; color: string }> } | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; label: string; color: string }>>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [hiddenCommunities, setHiddenCommunities] = useState<Set<number>>(new Set());
  const [stabilized, setStabilized] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Build graph data
  const { graph, nodeDegrees, communities, allNodeIds, maxDegree, communityLabels, communityCounts } = useMemo(() => {
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

    // Generate community labels (sorted by size, largest first)
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
      communityLabels: labels,
      communityCounts: counts,
    };
  }, [pages]);

  // Initialize vis-network
  useEffect(() => {
    if (!containerRef.current || pages.length === 0) return;
    let cancelled = false;

    async function init() {
      const [visNetwork, visData] = await Promise.all([
        import('vis-network/standalone'),
        import('vis-data/peer'),
      ]);
      if (cancelled) return;
      visNetworkLib = visNetwork;
      visDataLib = visData;

      const { DataSet } = visData;
      const { Network } = visNetwork;

      // Build nodes — Graphify style: dot shape, border, size based on degree
      const maxDeg = Math.max(1, maxDegree);
      const nodes = new DataSet(pages.map(page => {
        const degree = nodeDegrees.get(page.path) || 0;
        const cid = communities.get(page.path) ?? 0;
        const color = showCommunityColors
          ? COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]
          : '#4E79A7';
        const size = Math.max(10, Math.min(40, 10 + 30 * (degree / maxDeg)));

        return {
          id: page.path,
          label: page.frontmatter.title || page.path.split('/').pop()?.replace('.md', '') || page.path,
          color: {
            background: color,
            border: color,
            highlight: { background: '#ffffff', border: color },
          },
          size,
          font: { size: showLabels ? 10 : 0, color: '#ffffff' },
          title: page.frontmatter.title || page.path,
          _community: cid,
          _community_name: communityLabels.get(cid) || `Community ${cid}`,
          _source_file: page.path,
          _file_type: page.frontmatter.type || 'entity',
          _degree: degree,
        };
      }));

      // Build edges — Graphify style
      const edges = new DataSet(graph.edges.map((e, i) => ({
        id: i,
        from: e.source,
        to: e.target,
        label: '',
        title: e.linkType,
        dashes: e.linkType === 'embed',
        width: 1.5,
        color: { opacity: 0.7 },
        arrows: showArrows ? { to: { enabled: true, scaleFactor: 0.5 } } : undefined,
      })));

      nodesDSRef.current = nodes;
      edgesDSRef.current = edges;

      // vis-network options — Graphify's exact settings
      const network = new Network(containerRef.current!, { nodes, edges }, {
        physics: {
          enabled: true,
          solver: 'forceAtlas2Based',
          forceAtlas2Based: {
            gravitationalConstant: -60,
            centralGravity: 0.005,
            springLength: 120,
            springConstant: 0.08,
            damping: 0.4,
            avoidOverlap: 0.8,
          },
          stabilization: { iterations: 200, fit: true },
        },
        interaction: {
          hover: true,
          tooltipDelay: 100,
          hideEdgesOnDrag: true,
          navigationButtons: false,
          keyboard: false,
        },
        nodes: { shape: 'dot', borderWidth: 1.5 },
        edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.2 }, selectionWidth: 3 },
      });

      networkRef.current = network;

      // Disable physics after stabilization — Graphify behavior
      network.once('stabilizationIterationsDone', () => {
        network.setOptions({ physics: { enabled: false } });
        if (!cancelled) setStabilized(true);
      });

      // Click handler — show node info like Graphify
      let hoveredNodeId: string | null = null;
      network.on('hoverNode', (params: any) => {
        hoveredNodeId = params.node;
        containerRef.current!.style.cursor = 'pointer';
      });
      network.on('blurNode', () => {
        hoveredNodeId = null;
        containerRef.current!.style.cursor = 'default';
      });
      containerRef.current!.addEventListener('click', () => {
        if (hoveredNodeId !== null) {
          showNodeInfo(hoveredNodeId);
          network.selectNodes([hoveredNodeId]);
        }
      });
      network.on('click', (params: any) => {
        if (params.nodes.length > 0) {
          showNodeInfo(params.nodes[0]);
        } else if (hoveredNodeId === null) {
          setSelectedNode(null);
        }
      });

      // Focus page if specified
      if (focusPage && nodes.get(focusPage)) {
        setTimeout(() => {
          network.focus(focusPage, { scale: 1.4, animation: true });
          network.selectNodes([focusPage]);
          showNodeInfo(focusPage);
        }, 500);
      }

      function showNodeInfo(nodeId: string) {
        const n = nodes.get(nodeId);
        if (!n) return;
        const neighborIds = network.getConnectedNodes(nodeId) as string[];
        const neighborItems = neighborIds.map(nid => {
          const nb = nodes.get(nid);
          return {
            id: nid,
            label: nb ? (nb as any).label : nid,
            color: nb ? (nb as any).color.background : '#555',
          };
        });
        setSelectedNode({
          id: nodeId,
          label: n.label,
          type: (n as any)._file_type || 'unknown',
          community: (n as any)._community,
          communityName: (n as any)._community_name,
          source: (n as any)._source_file || '',
          degree: (n as any)._degree,
          neighbors: neighborItems.slice(0, 30),
        });
        // Notify parent of page selection
        if (onPageSelect) onPageSelect(nodeId);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [pages, showCommunityColors, showArrows, onPageSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update node visibility when communities are hidden
  useEffect(() => {
    const network = networkRef.current;
    const nodes = nodesDSRef.current;
    if (!network || !nodes) return;

    const updates = pages.map(page => {
      const cid = communities.get(page.path) ?? 0;
      const isHidden = hiddenCommunities.has(cid);
      return { id: page.path, hidden: isHidden };
    });
    nodes.update(updates);
  }, [hiddenCommunities, pages, communities]);

  // Update label visibility
  useEffect(() => {
    const network = networkRef.current;
    const nodes = nodesDSRef.current;
    if (!network || !nodes) return;

    const updates = pages.map(page => {
      const degree = nodeDegrees.get(page.path) || 0;
      const showLabel = showLabels || degree >= maxDegree * 0.15 || page.path === focusPage;
      return {
        id: page.path,
        font: { size: showLabel ? 10 : 0, color: '#ffffff' },
      };
    });
    nodes.update(updates);
  }, [showLabels, pages, nodeDegrees, maxDegree, focusPage]);

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

  const focusNode = useCallback((nodeId: string) => {
    const network = networkRef.current;
    if (!network) return;
    network.focus(nodeId, { scale: 1.4, animation: true });
    network.selectNodes([nodeId]);
  }, []);

  const handleSearchSelect = (nodeId: string) => {
    setShowSearchResults(false);
    setSearchText('');
    focusNode(nodeId);
    // Trigger info panel update
    const nodes = nodesDSRef.current;
    const network = networkRef.current;
    if (!nodes || !network) return;
    const n = nodes.get(nodeId);
    if (!n) return;
    const neighborIds = network.getConnectedNodes(nodeId) as string[];
    const neighborItems = neighborIds.map(nid => {
      const nb = nodes.get(nid);
      return {
        id: nid,
        label: nb ? (nb as any).label : nid,
        color: nb ? (nb as any).color.background : '#555',
      };
    });
    setSelectedNode({
      id: nodeId,
      label: n.label,
      type: (n as any)._file_type || 'unknown',
      community: (n as any)._community,
      communityName: (n as any)._community_name,
      source: (n as any)._source_file || '',
      degree: (n as any)._degree,
      neighbors: neighborItems.slice(0, 30),
    });
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

  // Hyperedge rendering — shaded regions for each community
  useEffect(() => {
    const network = networkRef.current;
    if (!network || !stabilized) return;

    // Get the canvas 2d context for drawing
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw hyperedges after drawing is done
    const afterDraw = () => {
      // Group nodes by community
      const communityNodes = new Map<number, Array<{ x: number; y: number }>>();
      const nodesDS = nodesDSRef.current;
      if (!nodesDS) return;

      const allNodes = nodesDS.get();
      for (const node of allNodes) {
        if ((node as any).hidden) continue;
        const cid = (node as any)._community;
        const pos = network.getPositions([node.id])[node.id];
        if (!pos) continue;
        if (!communityNodes.has(cid)) communityNodes.set(cid, []);
        communityNodes.get(cid)!.push(pos);
      }

      // Draw convex hulls for communities with 3+ visible nodes
      for (const [cid, positions] of communityNodes) {
        if (positions.length < 3) continue;
        if (hiddenCommunities.has(cid)) continue;

        // Compute convex hull (simple approach: use extreme points)
        const hull = computeConvexHull(positions);
        if (hull.length < 3) continue;

        const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length];

        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = color;
        ctx.beginPath();
        // Expand hull slightly
        const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
        const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
        const expanded = hull.map(p => ({
          x: cx + (p.x - cx) * 1.15,
          y: cy + (p.y - cy) * 1.15,
        }));
        ctx.moveTo(expanded[0].x, expanded[0].y);
        expanded.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    };

    network.on('afterDrawing', afterDraw);
    // Trigger a redraw
    network.redraw();

    return () => {
      network.off('afterDrawing', afterDraw);
    };
  }, [stabilized, hiddenCommunities]);

  const allHidden = hiddenCommunities.size === communityCounts.size;
  const someHidden = hiddenCommunities.size > 0 && hiddenCommunities.size < communityCounts.size;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (pages.length === 0) return <EmptyState />;

  return (
    <div className="flex h-full" style={{ background: '#0f0f1a' }}>
      {/* Graph canvas */}
      <div ref={containerRef} className="flex-1" style={{ width: '100%', height: '100%' }} />

      {/* Sidebar — Graphify style */}
      <div className="w-72 flex flex-col overflow-hidden border-l border-[#2a2a4e]" style={{ background: '#1a1a2e' }}>
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

        {/* Info panel — Graphify's click-to-inspect */}
        <div className="p-3 border-b border-[#2a2a4e] min-h-[140px]">
          <h3 className="text-xs text-[#aaa] uppercase tracking-wider font-semibold mb-2">Node Info</h3>
          {selectedNode ? (
            <div className="space-y-1 text-xs text-[#ccc]" style={{ lineHeight: 1.6 }}>
              <div className="text-sm font-medium text-[#e0e0e0] truncate">{selectedNode.label}</div>
              <div><span className="text-[#aaa]">Type:</span> <span className="capitalize">{selectedNode.type}</span></div>
              <div><span className="text-[#aaa]">Community:</span> <span>{selectedNode.communityName}</span></div>
              <div><span className="text-[#aaa]">Source:</span> <span className="truncate block">{selectedNode.source}</span></div>
              <div><span className="text-[#aaa]">Degree:</span> <span>{selectedNode.degree}</span></div>
              {selectedNode.neighbors.length > 0 && (
                <div className="mt-2">
                  <div className="text-[#aaa] mb-1" style={{ fontSize: 11 }}>Neighbors ({selectedNode.neighbors.length})</div>
                  <div className="max-h-40 overflow-y-auto">
                    {selectedNode.neighbors.map((n) => (
                      <div
                        key={n.id}
                        className="py-0.5 px-1.5 rounded cursor-pointer hover:bg-[#2a2a4e] text-xs whitespace-nowrap overflow-hidden text-ellipsis"
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
                className="legend-cb"
              />
              <span>Labels</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#aaa] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArrows}
                onChange={(e) => setShowArrows(e.target.checked)}
                className="legend-cb"
              />
              <span>Arrows</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#aaa] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCommunityColors}
                onChange={(e) => setShowCommunityColors(e.target.checked)}
                className="legend-cb"
              />
              <span>Colors</span>
            </label>
          </div>
        </div>

        {/* Community legend — Graphify style */}
        <div className="flex-1 overflow-y-auto p-3 border-b border-[#2a2a4e]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs text-[#aaa] uppercase tracking-wider font-semibold">Communities</h3>
            <label className="flex items-center gap-1 text-xs text-[#aaa] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!allHidden}
                ref={(el) => { if (el) el.indeterminate = someHidden; }}
                onChange={(e) => toggleAllCommunities(!e.target.checked)}
                className="legend-cb"
                id="select-all-cb"
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
                  className={`legend-item flex items-center gap-2 px-1 py-1 rounded cursor-pointer text-xs ${isHidden ? 'dimmed opacity-35' : ''} hover:bg-[#2a2a4e]`}
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

        {/* Stats footer — Graphify style */}
        <div className="p-3 text-xs text-[#555] border-t border-[#2a2a4e]">
          {pages.length} nodes &middot; {graph.edges.length} edges &middot; {communityCounts.size} communities
        </div>

        {/* Zoom controls */}
        <div className="p-2 border-t border-[#2a2a4e] flex justify-center gap-2">
          <button onClick={() => { const n = networkRef.current; if (n) n.zoom(n.getScale() * 1.3); }}
            className="p-1.5 rounded hover:bg-[#2a2a4e] text-[#555] hover:text-[#e0e0e0] transition-colors">
            <ZoomIn size={14} />
          </button>
          <button onClick={() => { const n = networkRef.current; if (n) n.zoom(n.getScale() / 1.3); }}
            className="p-1.5 rounded hover:bg-[#2a2a4e] text-[#555] hover:text-[#e0e0e0] transition-colors">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => { const n = networkRef.current; if (n) n.fit({ animation: true }); }}
            className="p-1.5 rounded hover:bg-[#2a2a4e] text-[#555] hover:text-[#e0e0e0] transition-colors">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Simple convex hull computation (Graham scan)
function computeConvexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return points;

  // Find bottom-most point (or left-most in case of tie)
  let pivot = points[0];
  for (const p of points) {
    if (p.y > pivot.y || (p.y === pivot.y && p.x < pivot.x)) {
      pivot = p;
    }
  }

  // Sort by polar angle relative to pivot
  const sorted = points
    .filter(p => p !== pivot)
    .sort((a, b) => {
      const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      if (angleA !== angleB) return angleA - angleB;
      const distA = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
      const distB = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
      return distA - distB;
    });

  const hull = [pivot];
  for (const p of sorted) {
    while (hull.length > 1) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(p);
  }
  return hull;
}
