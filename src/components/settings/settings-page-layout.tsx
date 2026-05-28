import { Children, type ReactNode } from "react";
import Link from "next/link";

interface SettingsPageLayoutProps {
  title: string;
  description?: string;
  backHref?: string;
  children: ReactNode;
}

export default function SettingsPageLayout({
  title,
  description,
  backHref,
  children,
}: SettingsPageLayoutProps) {
  const childrenArray = Children.toArray(children);
  const hasMultipleChildren = childrenArray.length > 1;

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            ← Back
          </Link>
        )}
        <div>
          <h1 className="text-base font-semibold text-text-primary">{title}</h1>
          {description && (
            <p className="mt-1 text-xs text-text-muted">{description}</p>
          )}
        </div>
      </div>
      {hasMultipleChildren
        ? childrenArray.reduce<ReactNode[]>(
            (acc, child, index) => {
              if (index === 0) return [child];
              return [...acc, <hr key={`sep-${index}`} />, child];
            },
            []
          )
        : children}
    </div>
  );
}
