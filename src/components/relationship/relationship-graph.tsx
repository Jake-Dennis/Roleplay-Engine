/**
 * RelationshipGraph Component
 *
 * SVG-based force-directed graph visualization of entity relationships.
 * Supports drag, zoom, pan, and click-to-highlight.
 *
 * Usage:
 *   <RelationshipGraph nodes={nodes} edges={edges} />
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  strength: number;
}

interface RelationshipGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
}

const TYPE_COLORS: Record<string, string> = {
  npc: "#4a9eff",
  location: "#22c55e",
  event: "#eab308",
  thread: "#3b82f6",
  character: "#ec4899",
};

export function RelationshipGraph({
  nodes: initialNodes,
  edges,
  width = 800,
  height = 600,
}: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Initialize node positions
  useEffect(() => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    const initialized = initialNodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / initialNodes.length;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    setNodes(initialized);
  }, [initialNodes, width, height]);

  // Simple force-directed layout (runs once on mount)
  useEffect(() => {
    if (nodes.length === 0) return;

    const iterations = 100;
    const repulsion = 5000;
    const attraction = 0.01;
    const damping = 0.85;

    let currentNodes = [...nodes];

    for (let iter = 0; iter < iterations; iter++) {
      const forces = currentNodes.map(() => ({ fx: 0, fy: 0 }));

      // Repulsion between all nodes
      for (let i = 0; i < currentNodes.length; i++) {
        for (let j = i + 1; j < currentNodes.length; j++) {
          const dx = currentNodes[j].x! - currentNodes[i].x!;
          const dy = currentNodes[j].y! - currentNodes[i].y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          forces[i].fx -= fx;
          forces[i].fy -= fy;
          forces[j].fx += fx;
          forces[j].fy += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const sourceIdx = currentNodes.findIndex((n) => n.id === edge.source);
        const targetIdx = currentNodes.findIndex((n) => n.id === edge.target);
        if (sourceIdx === -1 || targetIdx === -1) continue;

        const dx = currentNodes[targetIdx].x! - currentNodes[sourceIdx].x!;
        const dy = currentNodes[targetIdx].y! - currentNodes[sourceIdx].y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * attraction;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces[sourceIdx].fx += fx;
        forces[sourceIdx].fy += fy;
        forces[targetIdx].fx -= fx;
        forces[targetIdx].fy -= fy;
      }

      // Apply forces
      currentNodes = currentNodes.map((node, i) => ({
        ...node,
        x: node.x! + forces[i].fx * damping * 0.1,
        y: node.y! + forces[i].fy * damping * 0.1,
      }));
    }

    setNodes(currentNodes);
  }, [edges, nodes.length]);

  // Handle node drag
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      setDragging(nodeId);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        setNodes((prev) =>
          prev.map((n) => (n.id === dragging ? { ...n, x, y } : n))
        );
      } else if (isPanning) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        panStart.current = { x: e.clientX, y: e.clientY };
      }
    },
    [dragging, isPanning, pan, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
  }, []);

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.max(0.2, Math.min(3, prev * delta)));
    },
    []
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Connected nodes for highlighting
  const connectedIds = new Set<string>();
  if (selectedId) {
    connectedIds.add(selectedId);
    for (const edge of edges) {
      if (edge.source === selectedId) connectedIds.add(edge.target);
      if (edge.target === selectedId) connectedIds.add(edge.source);
    }
  }

  return (
    <div className="relative rounded-xl border border-border-default bg-bg-elevated overflow-hidden">
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg bg-bg-raised/90 p-1 backdrop-blur-sm">
        <button
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
          className="rounded p-1.5 text-text-muted hover:text-text-primary"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))}
          className="rounded p-1.5 text-text-muted hover:text-text-primary"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={resetView}
          className="rounded p-1.5 text-text-muted hover:text-text-primary"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="cursor-grab active:cursor-grabbing"
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((edge, i) => {
            const source = nodes.find((n) => n.id === edge.source);
            const target = nodes.find((n) => n.id === edge.target);
            if (!source || !target) return null;

            const isConnected =
              selectedId && (edge.source === selectedId || edge.target === selectedId);

            return (
              <g key={i}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={isConnected ? "#4a9eff" : "#3a3a3a"}
                  strokeWidth={isConnected ? 2 : 1}
                  strokeOpacity={selectedId && !isConnected ? 0.1 : 0.6}
                />
                {isConnected && (
                  <text
                    x={(source.x! + target.x!) / 2}
                    y={(source.y! + target.y!) / 2}
                    fill="#a0a0a0"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isSelected = selectedId === node.id;
            const isConnected = connectedIds.has(node.id);
            const color = TYPE_COLORS[node.type] || "#666666";
            const opacity = selectedId && !isConnected ? 0.2 : 1;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                opacity={opacity}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(isSelected ? null : node.id);
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              >
                <circle
                  r={isSelected ? 18 : 14}
                  fill={color}
                  fillOpacity={0.2}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text
                  y={28}
                  fill="#e8e8e8"
                  fontSize="11"
                  textAnchor="middle"
                  className="select-none"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg bg-bg-raised/90 px-3 py-2 text-xxs text-text-muted backdrop-blur-sm">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
