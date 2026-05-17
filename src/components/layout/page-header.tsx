/**
 * PageHeader Component
 *
 * Standard page header with title, subtitle, and optional action button.
 * Used across 14+ pages to maintain consistent layout.
 */

import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionIcon?: LucideIcon;
  onAction?: () => void;
}

export function PageHeader({ title, subtitle, actionLabel, actionIcon: ActionIcon, onAction }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-base font-semibold text-text-primary">{title}</h1>
        <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover"
        >
          {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
