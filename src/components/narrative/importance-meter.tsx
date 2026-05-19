/**
 * ImportanceMeter Component
 *
 * Visualizes 4-axis importance scores with horizontal bars and composite score.
 *
 * Usage:
 *   <ImportanceMeter scores={{ emotional: "high", local: "medium", canonical: "critical", recency: "low" }} />
 */

import { calculateImportance, type ImportanceScores } from "@/lib/importance";

interface ImportanceMeterProps {
  scores: ImportanceScores;
  showComposite?: boolean;
  size?: "sm" | "md";
}

const LEVEL_COLORS: Record<string, string> = {
  low: "bg-gray-500",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  critical: "bg-red-500",
};

const TIER_COLORS: Record<string, string> = {
  archived: "text-gray-400",
  low: "text-blue-400",
  normal: "text-amber-400",
  high: "text-red-400",
};

export function ImportanceMeter({
  scores,
  showComposite = true,
  size = "md",
}: ImportanceMeterProps) {
  const result = calculateImportance(scores);
  const barHeight = size === "sm" ? "h-1" : "h-1.5";
  const textSize = size === "sm" ? "text-xxs" : "text-xs";

  const axes = [
    { label: "Emotional", value: scores.emotional },
    { label: "Local", value: scores.local },
    { label: "Canonical", value: scores.canonical },
    { label: "Recency", value: scores.recency },
  ];

  return (
    <div className="space-y-2">
      {axes.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-2">
          <span className={`w-16 ${textSize} text-text-muted capitalize`}>{label}</span>
          <div className={`flex-1 ${barHeight} rounded-full bg-bg-raised overflow-hidden`}>
            <div
              className={`h-full rounded-full ${LEVEL_COLORS[value]} transition-all duration-300`}
              style={{ width: `${(value === "low" ? 25 : value === "medium" ? 50 : value === "high" ? 75 : 100)}%` }}
            />
          </div>
          <span className={`w-12 text-right ${textSize} capitalize text-text-muted`}>{value}</span>
        </div>
      ))}

      {showComposite && (
        <div className="flex items-center justify-between pt-2 border-t border-border-default">
          <span className={`font-medium ${textSize} text-text-primary`}>Composite Score</span>
          <span className={`font-semibold ${textSize} ${TIER_COLORS[result.tier]}`}>
            {result.composite} ({result.tier})
          </span>
        </div>
      )}
    </div>
  );
}
