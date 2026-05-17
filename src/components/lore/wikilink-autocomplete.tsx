/**
 * WikilinkAutocomplete Component
 *
 * Shows autocomplete suggestions when typing [[ in the lore editor.
 * Supports: [[Entity Name]] and [[display text|Entity Name]]
 *
 * Usage:
 *   <WikilinkAutocomplete
 *     triggerPosition={{ top: 100, left: 200 }}
 *     query="Ara"
 *     entities={entities}
 *     onSelect={(entity) => handleSelect(entity)}
 *     onClose={() => setShowAutocomplete(false)}
 *   />
 */

"use client";

import { useRef, useEffect, useState } from "react";
import { MapPin, Users, Sparkles, FileText } from "lucide-react";

interface LoreEntity {
  id: string;
  name: string;
  type: string;
}

interface WikilinkAutocompleteProps {
  triggerPosition: { top: number; left: number } | null;
  query: string;
  entities: LoreEntity[];
  onSelect: (entity: LoreEntity) => void;
  onClose: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  location: <MapPin className="h-3 w-3" />,
  npc: <Users className="h-3 w-3" />,
  event: <Sparkles className="h-3 w-3" />,
  narrative_memory: <FileText className="h-3 w-3" />,
};

export function WikilinkAutocomplete({
  triggerPosition,
  query,
  entities,
  onSelect,
  onClose,
}: WikilinkAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter entities by query
  const filtered = entities.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        onSelect(filtered[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  if (!triggerPosition || filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-64 rounded-lg border border-border-default bg-bg-elevated py-1 shadow-lg"
      style={{ top: triggerPosition.top, left: triggerPosition.left }}
    >
      {filtered.map((entity, i) => (
        <button
          key={entity.id}
          onClick={() => onSelect(entity)}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
            i === selectedIndex
              ? "bg-accent/10 text-accent"
              : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
          }`}
        >
          <span className="text-text-muted">{typeIcons[entity.type] || <FileText className="h-3 w-3" />}</span>
          <span className="truncate">{entity.name}</span>
          <span className="ml-auto text-xxs text-text-muted capitalize">{entity.type}</span>
        </button>
      ))}
    </div>
  );
}
