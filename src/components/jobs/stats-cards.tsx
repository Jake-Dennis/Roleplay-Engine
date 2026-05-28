import type { LucideIcon } from "lucide-react";

export interface StatCard {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  bg: string;
}

interface StatsCardsProps {
  items: StatCard[];
  className?: string;
}

export function StatsCards({ items, className = "grid-cols-5" }: StatsCardsProps) {
  return (
    <div className={`mb-6 grid ${className} gap-3`}>
      {items.map((s) => {
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
