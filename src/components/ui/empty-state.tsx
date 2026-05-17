/**
 * EmptyState Component
 *
 * Standard empty state display with icon, title, description, and optional action.
 * Used across 16+ pages for consistent empty list UX.
 */

import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
      <Icon className="mx-auto h-10 w-10 text-text-muted" />
      <h3 className="mt-3 text-sm font-medium text-text-primary">{title}</h3>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
