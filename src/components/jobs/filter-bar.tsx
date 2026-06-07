"use client";

import { Filter } from "lucide-react";
import { JOB_TYPES, JOB_TYPE_LABELS } from "@/lib/jobs/types";

interface FilterBarProps {
  status: string;
  type: string;
  onStatusChange: (s: string) => void;
  onTypeChange: (t: string) => void;
  onStatusFilterLoad?: (status: string) => void;
}

const STATUS_OPTIONS = ["all", "queued", "processing", "completed", "failed", "cancelled"];

export function FilterBar({
  status,
  type: typeFilter,
  onStatusChange,
  onTypeChange,
  onStatusFilterLoad,
}: FilterBarProps) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <Filter className="h-4 w-4 text-text-muted" />
      <div className="flex gap-1.5">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              onStatusChange(s);
              onStatusFilterLoad?.(s);
            }}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              status === s
                ? "bg-accent/10 text-text-accent"
                : "text-text-muted hover:bg-bg-raised hover:text-text-secondary"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="ml-auto">
        <select
          value={typeFilter}
          onChange={(e) => onTypeChange(e.target.value)}
          className="rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1.5 text-xs text-text-secondary"
        >
          <option value="all">All Types</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
