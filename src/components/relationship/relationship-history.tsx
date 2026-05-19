/**
 * RelationshipHistory Component
 *
 * Displays evolution timeline for a relationship with emotion bars.
 * Extracted from relationships/page.tsx.
 *
 * Usage:
 *   <RelationshipHistory entries={history} loading={loading} />
 */

import { Clock, Sparkles } from "lucide-react";
import { EmotionBar } from "./emotion-bar";

interface EvolutionEntry {
  id: string;
  emotional_state: Record<string, number>;
  relationship_stage: string | null;
  trigger_event: string | null;
  recorded_at: string;
}

interface RelationshipHistoryProps {
  entries: EvolutionEntry[];
  loading: boolean;
}

export function RelationshipHistory({ entries, loading }: RelationshipHistoryProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted py-4">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        <span className="text-xs">Loading history...</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 text-text-muted py-4">
        <Clock className="h-3.5 w-3.5" />
        <span className="text-xs">No evolution history yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-2 w-2 rounded-full bg-accent mt-1.5" />
            {i < entries.length - 1 && <div className="w-px flex-1 bg-border-default mt-1" />}
          </div>
          <div className="flex-1 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-primary">
                {entry.relationship_stage && (
                  <span className="capitalize font-medium">{entry.relationship_stage}</span>
                )}
              </span>
              <span className="text-xxs text-text-muted">
                {new Date(entry.recorded_at).toLocaleDateString()}
              </span>
            </div>
            {entry.trigger_event && (
              <p className="text-xxs text-text-muted mb-2 italic">{entry.trigger_event}</p>
            )}
            <div className="space-y-1">
              {Object.entries(entry.emotional_state)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([key, val]) => (
                  <EmotionBar key={key} label={key} value={val} />
                ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
