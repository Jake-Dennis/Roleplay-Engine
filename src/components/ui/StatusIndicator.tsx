import { clsx } from "clsx";

interface StatusIndicatorProps {
  status: "connected" | "disconnected" | "connecting";
  label?: string;
  size?: "sm" | "md";
}

export function StatusIndicator({
  status,
  label,
  size = "sm",
}: StatusIndicatorProps) {
  const colors = {
    connected: "bg-status-success",
    disconnected: "bg-status-error",
    connecting: "bg-status-warning animate-pulse",
  };

  const sizes = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx("rounded-full", colors[status], sizes[size])}
      />
      {label && (
        <span className="text-xs text-text-secondary">{label}</span>
      )}
    </div>
  );
}
