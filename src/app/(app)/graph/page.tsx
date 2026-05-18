"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Network, Sparkles, Filter } from "lucide-react";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";

interface Backlink {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  link_type: string | null;
  context_snippet: string | null;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  connections: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string | null;
}

export default function GraphPage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeUniverse) params.set("universe_id", activeUniverse.id);
    if (activeGroup) params.set("group_id", activeGroup.id);
    const url = `/api/backlinks${params.toString() ? "?" + params.toString() : ""}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setBacklinks(data.backlinks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeUniverse?.id, activeGroup?.id]);

  const buildGraph = useCallback(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    const filtered = filter === "all" ? backlinks : backlinks.filter((b) => b.link_type === filter);

    for (const link of filtered) {
      const sourceId = `${link.source_type}:${link.source_id}`;
      const targetId = `${link.target_type}:${link.target_id}`;

      if (!nodeMap.has(sourceId)) {
        nodeMap.set(sourceId, {
          id: sourceId,
          label: link.source_id,
          type: link.source_type,
          x: Math.random() * 600 + 100,
          y: Math.random() * 400 + 100,
          connections: 0,
        });
      }

      if (!nodeMap.has(targetId)) {
        nodeMap.set(targetId, {
          id: targetId,
          label: link.target_id,
          type: link.target_type,
          x: Math.random() * 600 + 100,
          y: Math.random() * 400 + 100,
          connections: 0,
        });
      }

      nodeMap.get(sourceId)!.connections++;
      nodeMap.get(targetId)!.connections++;

      edges.push({ source: sourceId, target: targetId, type: link.link_type });
    }

    nodesRef.current = Array.from(nodeMap.values());
    edgesRef.current = edges;
  }, [backlinks, filter]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    // Simple force-directed layout
    const simulate = () => {
      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 500 / (dist * dist);
          nodes[i].x -= (dx / dist) * force;
          nodes[i].y -= (dy / dist) * force;
          nodes[j].x += (dx / dist) * force;
          nodes[j].y += (dy / dist) * force;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.01;
        source.x += (dx / dist) * force;
        source.y += (dy / dist) * force;
        target.x -= (dx / dist) * force;
        target.y -= (dy / dist) * force;
      }

      // Center gravity
      for (const node of nodes) {
        node.x += (400 - node.x) * 0.001;
        node.y += (300 - node.y) * 0.001;
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw edges
      for (const edge of edges) {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = "rgba(99, 102, 241, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const radius = 4 + node.connections * 2;
        const color = getNodeColor(node.type);

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Label
        ctx.fillStyle = "#a0a0a0";
        ctx.font = "10px sans-serif";
        ctx.fillText(node.label, node.x + radius + 4, node.y + 3);
      }

      simulate();
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [backlinks, filter]);

  function getNodeColor(type: string): string {
    switch (type) {
      case "location": return "#4a9eff";
      case "npc": return "#22c55e";
      case "event": return "#eab308";
      case "memory": return "#ef4444";
      default: return "#666666";
    }
  }

  const linkTypes = ["all", ...new Set(backlinks.map((b) => b.link_type).filter((t): t is string => !!t))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Backlink Graph</h1>
          <p className="mt-1 text-xs text-text-muted">Visualize connections between lore entities</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-text-muted" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-border-default bg-bg-raised px-2 py-1.5 text-xs text-text-primary"
          >
            {linkTypes.map((type) => (
              <option key={type} value={type}>
                {type === "all" ? "All Links" : type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading graph...</span>
        </div>
      ) : backlinks.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <Network className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No backlinks</h3>
          <p className="mt-1 text-xs text-text-muted">
            Create lore entries with [[wikilinks]] to build the graph
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full rounded-lg bg-surface"
          />
          <div className="mt-3 flex items-center gap-4 text-xxs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#4a9eff]" /> Location
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" /> NPC
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#eab308]" /> Event
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" /> Memory
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
