/**
 * StatsCards Component
 *
 * A row of 5 stat cards showing queued/processing/completed/failed/total
 * with appropriate icons and colors.
 */

import { Clock, Loader2, CheckCircle, XCircle, ListTodo } from "lucide-react";
import type { Stats } from "@/lib/jobs/types";

interface StatsCardsProps {
  stats: Stats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const statCards = [
    { label: "Queued", value: stats.queued, icon: Clock, color: "text-accent", bg: "bg-accent/10" },
    { label: "Processing", value: stats.processing, icon: Loader2, color: "text-warning", bg: "bg-warning/10" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Failed", value: stats.failed, icon: XCircle, color: "text-error", bg: "bg-error/10" },
    { label: "Total", value: stats.total, icon: ListTodo, color: "text-text-primary", bg: "bg-bg-raised" },
  ];

  return (
    <div className="mb-6 grid grid-cols-5 gap-3">
      {statCards.map((s) => {
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
