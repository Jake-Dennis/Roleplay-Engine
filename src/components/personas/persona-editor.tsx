"use client";

import {
  User,
  Check,
  X,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Sparkles,
  FileText,
  BookOpen,
  MessageSquare,
  Settings2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { TabKey } from "./persona-types";

interface PersonaEditorProps {
  isEmpty: boolean;
  formName: string;
  isActive: boolean;
  activeTab: TabKey;
  showPreview: boolean;
  saving: boolean;
  hasSelection: boolean;
  isCreating: boolean;
  onTabChange: (tab: TabKey) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onTogglePreview: () => void;
  onActivate: () => void;
  children: ReactNode;
}

const TABS = [
  { key: "description" as TabKey, label: "Description", icon: FileText },
  { key: "personality" as TabKey, label: "Personality", icon: User },
  { key: "scenario" as TabKey, label: "Scenario", icon: BookOpen },
  { key: "dialogue" as TabKey, label: "Dialogue", icon: MessageSquare },
  { key: "advanced" as TabKey, label: "Advanced", icon: Settings2 },
];

export function PersonaEditor({
  isEmpty,
  formName,
  isActive,
  activeTab,
  showPreview,
  saving,
  hasSelection,
  isCreating,
  onTabChange,
  onSave,
  onDelete,
  onCancel,
  onTogglePreview,
  onActivate,
  children,
}: PersonaEditorProps) {
  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <User className="mx-auto h-10 w-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary mb-1">Select or create a persona</p>
          <p className="text-xs text-text-muted">Character cards for roleplay sessions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-bg-raised flex items-center justify-center text-text-muted">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{formName || "New Persona"}</h2>
            {isActive && (
              <span className="text-[10px] text-accent">Active persona</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasSelection && !isActive && (
            <button
              onClick={onActivate}
              className="flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
            >
              <Check className="h-3.5 w-3.5" />
              Activate
            </button>
          )}
          <button
            onClick={onTogglePreview}
            className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight"
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={onSave}
            disabled={saving || !formName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
          {hasSelection && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1 rounded-lg bg-error/10 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {isCreating && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Tabs (hidden in preview mode) */}
      {!showPreview && (
        <div className="flex gap-1 mb-3 border-b border-border-default pb-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                activeTab === key
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-raised"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
