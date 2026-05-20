"use client";

/**
 * ChatExport Component
 *
 * Dropdown menu to export session chat in multiple formats.
 * Triggers download via API endpoint.
 *
 * Usage:
 *   <ChatExport sessionId={session.id} />
 */

import { useState } from "react";
import { Download, FileJson, FileText, FileType, ChevronDown, ChevronUp } from "lucide-react";

interface ChatExportProps {
  sessionId: string;
}

const FORMATS = [
  { label: "JSON", value: "json", icon: FileJson },
  { label: "Markdown", value: "md", icon: FileText },
  { label: "Plain Text", value: "txt", icon: FileType },
];

export function ChatExport({ sessionId }: ChatExportProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = (format: string) => {
    window.open(`/api/sessions/${sessionId}/export?format=${format}`);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-md border border-border-default bg-bg-raised px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight hover:text-text-primary"
        title="Export chat"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Export</span>
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border-default bg-bg-elevated shadow-lg">
          {FORMATS.map((fmt) => {
            const Icon = fmt.icon;
            return (
              <button
                key={fmt.value}
                onClick={() => handleExport(fmt.value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-raised hover:text-text-primary"
              >
                <Icon className="h-3.5 w-3.5 text-text-muted" />
                {fmt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
