import { Sparkles } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="flex items-center gap-2 text-text-muted">
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading...</span>
      </div>
    </div>
  );
}
