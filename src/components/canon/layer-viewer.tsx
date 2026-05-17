"use client";

/**
 * LayerViewer Component
 *
 * Shows all 5 canon layers as tabs with entity counts and visual indicators.
 * Used on the canon page to give an overview of lore distribution across layers.
 */

import { useState } from "react";
import { Lock, Shield, FileText, Clock, AlertTriangle } from "lucide-react";

const LAYERS = [
  { key: "immutable_canon", label: "Immutable", icon: Lock, color: "text-error", bg: "bg-error/10", border: "border-error/20" },
  { key: "soft_canon", label: "Soft Canon", icon: Shield, color: "text-accent", bg: "bg-accent/10", border: "border-accent/20" },
  { key: "generated_lore", label: "Generated", icon: FileText, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
  { key: "session_lore", label: "Session", icon: Clock, color: "text-success", bg: "bg-success/10", border: "border-success/20" },
  { key: "rumor", label: "Rumor", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
] as const;

interface LayerStats {
  immutable_canon: number;
  soft_canon: number;
  generated_lore: number;
  session_lore: number;
  rumor: number;
}

interface LayerViewerProps {
  stats: LayerStats;
  total: number;
}

export function LayerViewer({ stats, total }: LayerViewerProps) {
  const [activeLayer, setActiveLayer] = useState<string>("all");

  const filteredLayers = activeLayer === "all" ? LAYERS : LAYERS.filter((l) => l.key === activeLayer);

  return (
    <div className="space-y-4">
      {/* Layer summary bar */}
      <div className="flex gap-1 rounded-lg bg-bg-raised p-1">
        <button
          onClick={() => setActiveLayer("all")}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            activeLayer === "all" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
          }`}
        >
          All ({total})
        </button>
        {LAYERS.map(({ key, label, icon: Icon, color, bg }) => {
          const count = stats[key as keyof LayerStats] || 0;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setActiveLayer(key)}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                activeLayer === key ? `${bg} ${color}` : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Icon className="h-3 w-3" />
              {count}
            </button>
          );
        })}
      </div>

      {/* Layer breakdown cards */}
      <div className="grid grid-cols-5 gap-3">
        {filteredLayers.map(({ key, label, icon: Icon, color, bg, border }) => {
          const count = stats[key as keyof LayerStats] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div
              key={key}
              className={`rounded-xl border ${border || "border-border-default"} ${bg} px-4 py-3`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className={`text-xxs font-medium ${color}`}>{label}</span>
              </div>
              <p className={`text-xl font-semibold ${color}`}>{count}</p>
              <p className="text-xxs text-text-muted">{pct}% of total</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
