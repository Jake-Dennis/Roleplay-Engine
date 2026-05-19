/**
 * EmotionBar Component
 *
 * Visualizes a single emotion value with a colored horizontal bar.
 * Extracted from relationships/page.tsx.
 *
 * Usage:
 *   <EmotionBar label="trust" value={0.75} />
 */

import { EMOTION_COLORS } from "@/lib/entity-constants";

interface EmotionBarProps {
  label: string;
  value: number;
}

export function EmotionBar({ label, value }: EmotionBarProps) {
  const color = EMOTION_COLORS[label.toLowerCase()] || "bg-gray-500";
  const pct = Math.min(100, Math.max(0, value * 100));

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xxs capitalize text-text-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-bg-raised overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xxs text-text-muted">{value.toFixed(2)}</span>
    </div>
  );
}
