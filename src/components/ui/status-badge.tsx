/**
 * StatusBadge Component
 *
 * Colored pill badge for status/escalation/importance/state.
 * Used across 5+ pages with duplicated color mapping logic.
 */

interface StatusBadgeProps {
  label: string;
  variant?: "default" | "success" | "warning" | "error" | "info" | "accent";
  size?: "sm" | "md";
}

const VARIANT_CLASSES: Record<string, string> = {
  default: "bg-bg-raised text-text-muted",
  success: "bg-success/10 text-success",
  warning: "bg-amber-500/10 text-amber-500",
  error: "bg-error/10 text-error",
  info: "bg-blue-500/10 text-blue-500",
  accent: "bg-accent/10 text-accent",
};

export function StatusBadge({ label, variant = "default", size = "sm" }: StatusBadgeProps) {
  const sizeClasses = size === "sm" ? "px-1.5 py-0.5 text-xxs" : "px-2.5 py-1 text-xs";

  return (
    <span className={`rounded-full font-medium ${sizeClasses} ${VARIANT_CLASSES[variant]}`}>
      {label}
    </span>
  );
}

/**
 * Get variant from status string
 */
export function statusToVariant(status: string): StatusBadgeProps["variant"] {
  const map: Record<string, StatusBadgeProps["variant"]> = {
    active: "accent",
    resolved: "success",
    validated: "success",
    rejected: "error",
    paused: "warning",
    abandoned: "default",
    critical: "error",
    high: "warning",
    medium: "info",
    low: "default",
    "immutable_canon": "accent",
    "soft_canon": "info",
    "generated_lore": "warning",
    "session_lore": "default",
    rumor: "default",
    queued: "info",
    processing: "warning",
    completed: "success",
    failed: "error",
    cancelled: "default",
  };
  return map[status] || "default";
}
