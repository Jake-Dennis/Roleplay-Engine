"use client";

import { Plus, User } from "lucide-react";
import type { Persona } from "./persona-types";

interface PersonaListProps {
  personas: Persona[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  activePersonaId?: string | null;
}

export function PersonaList({
  personas,
  selectedId,
  onSelect,
  onCreateNew,
  activePersonaId,
}: PersonaListProps) {
  return (
    <div className="w-64 flex-shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-semibold text-text-primary">Personas</h1>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`w-full text-left rounded-lg px-3 py-2.5 text-xs transition-colors ${
              selectedId === p.id
                ? "bg-accent/10 text-accent border border-accent/30"
                : "bg-bg-elevated text-text-secondary hover:bg-bg-raised border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-bg-raised flex items-center justify-center text-text-muted flex-shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{p.name}</span>
                  {(activePersonaId === p.id || p.is_active === 1) && (
                    <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] text-accent flex-shrink-0">
                      Active
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-[10px] text-text-muted truncate">{p.description}</p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
