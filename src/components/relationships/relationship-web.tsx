"use client";

/**
 * RelationshipWeb Component
 *
 * SVG-based force-directed graph showing the relationship web between characters/NPCs.
 * Nodes = entities (sized by importance), Edges = relationships (colored by dominant emotion).
 * Hover shows tooltip, click opens detail panel.
 */

import { useState, useRef, useCallback } from "react";
import { buildRelationshipGraph, VizNode, VizEdge, EMOTION_COLORS } from "@/lib/relationship-viz";

interface Relationship {
  id: string;
  source_entity: string;
  target_entity: string;
  emotional_state: string | null;
  relationship_stage: string;
  updated_at: string;
}

interface RelationshipWebProps {
  relationships: Relationship[];
  onSelectRelationship?: (rel: Relationship) => void;
}

export function RelationshipWeb({ relationships, onSelectRelationship }: RelationshipWebProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const graph = buildRelationshipGraph(relationships);

  const handleNodeHover = useCallback((node: VizNode, e: React.MouseEvent) => {
    setHoveredNode(node.id);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        x: e.clientX - rect.left + 10,
        y: e.clientY - rect.top - 10,
        content: `${node.name} (${node.connections} connections)`,
      });
    }
  }, []);

  const handleNodeLeave = useCallback(() => {
    setHoveredNode(null);
    setTooltip(null);
  }, []);

  const handleNodeClick = useCallback((node: VizNode) => {
    // Find first relationship involving this node
    const rel = relationships.find(
      (r) => r.source_entity === node.id || r.target_entity === node.id
    );
    if (rel && onSelectRelationship) {
      onSelectRelationship(rel);
    }
  }, [relationships, onSelectRelationship]);

  const handleEdgeHover = useCallback((index: number, edge: VizEdge, e: React.MouseEvent) => {
    setHoveredEdge(index);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const emotionStr = Object.entries(edge.emotions)
        .filter(([, v]) => v > 0.1)
        .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
        .join(", ");
      setTooltip({
        x: e.clientX - rect.left + 10,
        y: e.clientY - rect.top - 10,
        content: `${edge.source} ↔ ${edge.target}\nStage: ${edge.stage}\n${emotionStr || "No emotions"}`,
      });
    }
  }, []);

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdge(null);
    setTooltip(null);
  }, []);

  if (relationships.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted">
        <p className="text-xs">No relationships to visualize</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-border-default bg-bg-elevated overflow-hidden">
      <svg
        ref={svgRef}
        viewBox="0 0 800 500"
        className="w-full h-auto"
        style={{ minHeight: "400px" }}
      >
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border-default" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Edges */}
        {graph.edges.map((edge, i) => {
          const sourceNode = graph.nodes.find((n) => n.id === edge.source);
          const targetNode = graph.nodes.find((n) => n.id === edge.target);
          if (!sourceNode || !targetNode) return null;

          const isHighlighted = hoveredNode === edge.source || hoveredNode === edge.target;
          const isHovered = hoveredEdge === i;
          const color = EMOTION_COLORS[edge.dominantEmotion] || EMOTION_COLORS.neutral;

          return (
            <g key={i}>
              <line
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke={color}
                strokeWidth={isHovered ? 4 : Math.max(1, edge.strength * 3)}
                strokeOpacity={isHighlighted || isHovered ? 0.8 : 0.3}
                className="transition-all duration-150"
                onMouseEnter={(e) => handleEdgeHover(i, edge, e)}
                onMouseLeave={handleEdgeLeave}
              />
              {/* Invisible wider hit area */}
              <line
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke="transparent"
                strokeWidth={12}
                onMouseEnter={(e) => handleEdgeHover(i, edge, e)}
                onMouseLeave={handleEdgeLeave}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {graph.nodes.map((node) => {
          const isHovered = hoveredNode === node.id;
          const isConnected = hoveredNode && graph.edges.some(
            (e) => (e.source === hoveredNode && e.target === node.id) ||
                   (e.target === hoveredNode && e.source === node.id)
          );
          const radius = 12 + node.importance * 16;

          return (
            <g
              key={node.id}
              onMouseEnter={(e) => handleNodeHover(node, e)}
              onMouseLeave={handleNodeLeave}
              onClick={() => handleNodeClick(node)}
              className="cursor-pointer"
            >
              {/* Glow effect */}
              {isHovered && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 6}
                  fill="currentColor"
                  className="text-accent"
                  opacity={0.15}
                />
              )}
              {/* Node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={isHovered ? "currentColor" : "currentColor"}
                className={isHovered ? "text-accent" : isConnected ? "text-accent/60" : "text-bg-highlight"}
                stroke={isHovered ? "#4a9eff" : "#3a3a3a"}
                strokeWidth={isHovered ? 2 : 1}
                opacity={hoveredNode && !isHovered && !isConnected ? 0.3 : 1}
                style={{ transition: "all 0.15s ease" }}
              />
              {/* Label */}
              <text
                x={node.x}
                y={node.y + radius + 14}
                textAnchor="middle"
                className="fill-text-primary"
                fontSize={isHovered ? 11 : 9}
                fontWeight={isHovered ? 600 : 400}
                opacity={hoveredNode && !isHovered && !isConnected ? 0.3 : 1}
                style={{ transition: "all 0.15s ease" }}
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 rounded-lg border border-border-default bg-bg-elevated px-3 py-2 shadow-xl pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <pre className="text-xxs text-text-primary whitespace-pre-wrap">{tooltip.content}</pre>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 rounded-lg bg-bg-elevated/90 backdrop-blur px-3 py-2 border border-border-default">
        <p className="text-xxs font-medium text-text-muted mb-1">Emotions</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(EMOTION_COLORS).slice(0, 6).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xxs text-text-muted capitalize">{key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
