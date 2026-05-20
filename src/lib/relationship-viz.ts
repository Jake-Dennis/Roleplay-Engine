/**
 * Relationship Visualization Utilities
 *
 * Provides graph data building and force-directed layout for the relationship web.
 */

import type { EmotionalState } from "@/lib/relationship-types";
import { safeParse } from "@/lib/safe-json";

export interface VizNode {
  id: string;
  name: string;
  x: number;
  y: number;
  importance: number;
  connections: number;
}

export interface VizEdge {
  source: string;
  target: string;
  strength: number;
  dominantEmotion: string;
  emotions: EmotionalState;
  stage: string;
}

export interface RelationshipGraph {
  nodes: VizNode[];
  edges: VizEdge[];
}

/**
 * Build a relationship graph from raw relationship data.
 */
export function buildRelationshipGraph(
  relationships: Array<{
    id: string;
    source_entity: string;
    target_entity: string;
    emotional_state: string | null;
    relationship_stage: string;
    updated_at: string;
  }>
): RelationshipGraph {
  const nodeMap = new Map<string, VizNode>();
  const edges: VizEdge[] = [];

  for (const rel of relationships) {
    const emotions = parseEmotions(rel.emotional_state);
    const strength = calculateStrength(emotions);
    const dominantEmotion = getDominantEmotion(emotions);

    // Add source node
    if (!nodeMap.has(rel.source_entity)) {
      nodeMap.set(rel.source_entity, {
        id: rel.source_entity,
        name: rel.source_entity,
        x: 0,
        y: 0,
        importance: 0,
        connections: 0,
      });
    }
    nodeMap.get(rel.source_entity)!.connections++;

    // Add target node
    if (!nodeMap.has(rel.target_entity)) {
      nodeMap.set(rel.target_entity, {
        id: rel.target_entity,
        name: rel.target_entity,
        x: 0,
        y: 0,
        importance: 0,
        connections: 0,
      });
    }
    nodeMap.get(rel.target_entity)!.connections++;

    edges.push({
      source: rel.source_entity,
      target: rel.target_entity,
      strength,
      dominantEmotion,
      emotions,
      stage: rel.relationship_stage,
    });
  }

  // Calculate importance based on connection count
  const maxConnections = Math.max(...Array.from(nodeMap.values()).map((n) => n.connections), 1);
  for (const node of nodeMap.values()) {
    node.importance = node.connections / maxConnections;
  }

  const nodes = Array.from(nodeMap.values());

  // Apply force-directed layout
  layoutForceDirected(nodes, edges);

  return { nodes, edges };
}

/**
 * Simple force-directed layout algorithm.
 * Runs a fixed number of iterations to position nodes.
 */
export function layoutForceDirected(
  nodes: VizNode[],
  edges: VizEdge[],
  iterations: number = 100
): void {
  if (nodes.length === 0) return;

  const width = 800;
  const height = 500;
  const centerX = width / 2;
  const centerY = height / 2;

  // Initialize positions in a circle
  const radius = Math.min(width, height) * 0.35;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    node.x = centerX + radius * Math.cos(angle);
    node.y = centerY + radius * Math.sin(angle);
  });

  const nodeIndex = new Map<string, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  const repulsion = 5000;
  const attraction = 0.01;
  const gravity = 0.005;
  const damping = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations;
    const forces = nodes.map(() => ({ fx: 0, fy: 0 }));

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
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
      const si = nodeIndex.get(edge.source);
      const ti = nodeIndex.get(edge.target);
      if (si === undefined || ti === undefined) continue;

      const dx = nodes[ti].x - nodes[si].x;
      const dy = nodes[ti].y - nodes[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * attraction * edge.strength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      forces[si].fx += fx;
      forces[si].fy += fy;
      forces[ti].fx -= fx;
      forces[ti].fy -= fy;
    }

    // Gravity toward center
    for (let i = 0; i < nodes.length; i++) {
      forces[i].fx += (centerX - nodes[i].x) * gravity;
      forces[i].fy += (centerY - nodes[i].y) * gravity;
    }

    // Apply forces with damping
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x += forces[i].fx * temperature * damping;
      nodes[i].y += forces[i].fy * temperature * damping;

      // Clamp to bounds
      nodes[i].x = Math.max(50, Math.min(width - 50, nodes[i].x));
      nodes[i].y = Math.max(50, Math.min(height - 50, nodes[i].y));
    }
  }
}

/**
 * Calculate emotion vectors for a relationship.
 */
export function calculateEmotionVectors(
  emotionalState: string | null
): EmotionalState {
  return parseEmotions(emotionalState);
}

function parseEmotions(emotionalState: string | null): EmotionalState {
  return safeParse<EmotionalState>(emotionalState, {}) as EmotionalState;
}

function calculateStrength(emotions: EmotionalState): number {
  const values = Object.values(emotions);
  if (values.length === 0) return 0.5;
  const sum = values.reduce((a, b) => a + Math.abs(b), 0);
  return Math.min(1, sum / (values.length * 0.5));
}

function getDominantEmotion(emotions: EmotionalState): string {
  let maxVal = 0;
  let maxKey = "neutral";
  for (const [key, val] of Object.entries(emotions)) {
    if (Math.abs(val) > maxVal) {
      maxVal = Math.abs(val);
      maxKey = key;
    }
  }
  return maxKey;
}

/**
 * Emotion color mapping for visualization.
 */
export const EMOTION_COLORS: Record<string, string> = {
  trust: "#4ade80",
  suspicion: "#f87171",
  loyalty: "#60a5fa",
  resentment: "#f97316",
  attraction: "#e879f9",
  respect: "#fbbf24",
  fear: "#a78bfa",
  neutral: "#6b7280",
};

/**
 * Stage color mapping.
 */
export const STAGE_COLORS: Record<string, string> = {
  acquaintance: "#6b7280",
  friend: "#60a5fa",
  ally: "#4ade80",
  trusted: "#22d3ee",
  rival: "#f97316",
  enemy: "#f87171",
  lover: "#e879f9",
  family: "#fbbf24",
};
