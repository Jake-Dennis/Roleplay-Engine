import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface JobsHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function JobsHeader({ icon: Icon, title, subtitle, children }: JobsHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        </div>
        <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
