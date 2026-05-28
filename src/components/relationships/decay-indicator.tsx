/**
 * Decay Indicator Component
 *
 * Shows relationship decay status based on days since last interaction.
 * - Healthy: < 7 days (green)
 * - Warning: 7-14 days (amber)
 * - Critical: > 14 days (red)
 */

import { TIME } from "@/lib/config";
import { Clock, AlertTriangle, HeartOff } from "lucide-react";

export interface DecayStatus {
  daysSinceUpdate: number;
  status: "healthy" | "warning" | "critical" | "strangers";
  label: string;
}

export function getDecayStatus(updatedAt: string | null): DecayStatus {
  if (!updatedAt) return { daysSinceUpdate: 0, status: "critical", label: "Unknown" };

  const lastUpdate = new Date(updatedAt).getTime();
  const daysSinceUpdate = (Date.now() - lastUpdate) / TIME.ONE_DAY;

  if (daysSinceUpdate < 7) {
    return { daysSinceUpdate: Math.round(daysSinceUpdate), status: "healthy", label: "Healthy" };
  } else if (daysSinceUpdate < 14) {
    return { daysSinceUpdate: Math.round(daysSinceUpdate), status: "warning", label: "Decaying" };
  } else {
    return { daysSinceUpdate: Math.round(daysSinceUpdate), status: "critical", label: "Critical" };
  }
}

const STATUS_CONFIG = {
  healthy: {
    icon: Clock,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
  },
  critical: {
    icon: HeartOff,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
  },
  strangers: {
    icon: HeartOff,
    color: "text-gray-400",
    bg: "bg-gray-400/10",
    border: "border-gray-400/20",
  },
};

export function DecayIndicator({ updatedAt, compact = false }: { updatedAt: string | null; compact?: boolean }) {
  const decay = getDecayStatus(updatedAt);
  const config = STATUS_CONFIG[decay.status];
  const Icon = config.icon;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xxs ${config.bg} ${config.color}`}>
        <Icon className="h-2.5 w-2.5" />
        {decay.daysSinceUpdate}d
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border ${config.border} ${config.bg} px-2.5 py-1.5`}>
      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
      <div className="flex flex-col">
        <span className={`text-xxs font-medium ${config.color}`}>{decay.label}</span>
        <span className="text-xxs text-text-muted">{decay.daysSinceUpdate} days since last interaction</span>
      </div>
    </div>
  );
}
