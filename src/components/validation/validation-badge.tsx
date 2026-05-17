/**
 * ValidationBadge Component
 *
 * Shows validation status for AI-generated content with confidence score.
 *
 * Usage:
 *   <ValidationBadge status="validated" confidence={0.92} />
 */

"use client";

import { CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";

interface ValidationBadgeProps {
  status: "validated" | "pending" | "failed" | "unvalidated";
  confidence?: number; // 0-1
  size?: "sm" | "md";
}

const STATUS_CONFIG = {
  validated: {
    icon: CheckCircle,
    label: "Validated",
    color: "text-success",
    bg: "bg-success/10",
  },
  pending: {
    icon: Loader2,
    label: "Pending",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-error",
    bg: "bg-error/10",
  },
  unvalidated: {
    icon: AlertTriangle,
    label: "Unvalidated",
    color: "text-text-muted",
    bg: "bg-bg-raised",
  },
};

export function ValidationBadge({
  status,
  confidence,
  size = "md",
}: ValidationBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const textSize = size === "sm" ? "text-xxs" : "text-xs";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${config.bg}`}>
      <Icon className={`${iconSize} ${config.color} ${status === "pending" ? "animate-spin" : ""}`} />
      <span className={`${textSize} font-medium ${config.color}`}>{config.label}</span>
      {confidence !== undefined && status === "validated" && (
        <span className={`${textSize} text-text-muted`}>
          ({Math.round(confidence * 100)}%)
        </span>
      )}
    </div>
  );
}
