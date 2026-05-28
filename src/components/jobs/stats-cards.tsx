/**
 * StatsCards Component
 *
 * A row of stat cards showing job queue statistics
 * with appropriate icons and colors.
 * Default: 5 cards (Queued, Processing, Completed, Failed, Total).
 * Customize with `items` and `className` props.
 */

import { type ComponentType } from "react";
import { Clock, Loader2, CheckCircle, XCircle, ListTodo } from "lucide-react";
import type { Stats } from "@/lib/jobs/types";

export interface StatCardItem {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

interface StatsCardsProps {
  stats: Stats;
  items?: StatCardItem[];
  className?: string;
}

export function StatsCards({ stats, items, className }: StatsCardsProps) {
  const defaultItems: StatCardItem[] = [
    { label: "Queued", value: stats.queued, icon: Clock, color: "text-accent", bg: "bg-accent/10" },
    { label: "Processing", value: stats.processing, icon: Loader2, color: "text-warning", bg: "bg-warning/10" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Failed", value: stats.failed, icon: XCircle, color: "text-error", bg: "bg-error/10" },
    { label: "Total", value: stats.total, icon: ListTodo, color: "text-text-primary", bg: "bg-bg-raised" },
  ];

  const displayItems = items ?? defaultItems;
  const gridCols = className ?? "grid-cols-5";

  return (
    <div className={`mb-6 grid ${gridCols} gap-3`}>
      {displayItems.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className={`rounded-xl border border-border-default ${s.bg} px-4 py-3`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xxs text-text-muted">{s.label}</p>
                <p className={`text-xl font-semibold ${s.color}`}>{s.value}</p>
              </div>
              <Icon className={`h-5 w-5 ${s.color}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
