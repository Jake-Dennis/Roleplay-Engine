/**
 * LoreEditor Component
 *
 * Obsidian-style markdown editor with frontmatter support, live preview,
 * and wikilink autocomplete.
 *
 * Usage:
 *   <LoreEditor
 *     entityId="loc_123"
 *     entityType="location"
 *     initialContent={markdown}
 *     initialFrontmatter={data}
 *     onSave={(content, frontmatter) => handleSave(content, frontmatter)}
 *   />
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Save, Eye, Edit3, FileText, Tag, MapPin, Users, Sparkles } from "lucide-react";
import { parseFrontmatter, stringifyFrontmatter, FrontmatterData } from "@/lib/markdown";

interface LoreEditorProps {
  entityId: string;
  entityType: "location" | "npc" | "event" | "narrative_memory";
  initialContent?: string;
  initialFrontmatter?: FrontmatterData;
  onSave: (content: string, frontmatter: FrontmatterData) => Promise<void>;
}

export function LoreEditor({
  entityId: _entityId,
  entityType,
  initialContent = "",
  initialFrontmatter = {},
  onSave,
}: LoreEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [frontmatter, setFrontmatter] = useState<FrontmatterData>(initialFrontmatter);
  const [showPreview, setShowPreview] = useState(false);
  const [showFrontmatter, setShowFrontmatter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save indicator reset
  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(content, frontmatter);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, frontmatter]);

  const entityTypeIcon = {
    location: <MapPin className="h-3.5 w-3.5" />,
    npc: <Users className="h-3.5 w-3.5" />,
    event: <Sparkles className="h-3.5 w-3.5" />,
    narrative_memory: <FileText className="h-3.5 w-3.5" />,
  }[entityType];

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{entityTypeIcon}</span>
          <span className="text-xs text-text-secondary capitalize">{entityType.replace("_", " ")}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFrontmatter(!showFrontmatter)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xxs transition-colors ${
              showFrontmatter
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-bg-raised hover:text-text-secondary"
            }`}
          >
            <Tag className="h-3 w-3" />
            Frontmatter
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xxs transition-colors ${
              showPreview
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-bg-raised hover:text-text-secondary"
            }`}
          >
            {showPreview ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xxs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? (
              <Sparkles className="h-3 w-3 animate-pulse" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <span className="text-xxs text-success">Saved</span>
          )}
        </div>
      </div>

      {/* Frontmatter Editor */}
      {showFrontmatter && (
        <div className="border-b border-border-default bg-bg-raised px-4 py-3">
          <h3 className="text-xs font-medium text-text-primary mb-2">Frontmatter</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Name</label>
              <input
                type="text"
                value={frontmatter.name || ""}
                onChange={(e) => setFrontmatter({ ...frontmatter, name: e.target.value })}
                className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Importance</label>
              <select
                value={frontmatter.importance || "medium"}
                onChange={(e) => setFrontmatter({ ...frontmatter, importance: e.target.value })}
                className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Tags (comma-separated)</label>
              <input
                type="text"
                value={(frontmatter.tags || []).join(", ")}
                onChange={(e) =>
                  setFrontmatter({
                    ...frontmatter,
                    tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                  })
                }
                className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
              />
            </div>
            {entityType === "npc" && (
              <div>
                <label className="mb-1 block text-xxs text-text-muted">Canon Status</label>
                <select
                  value={frontmatter.canon_status || "generated"}
                  onChange={(e) => setFrontmatter({ ...frontmatter, canon_status: e.target.value })}
                  className="w-full rounded border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary"
                >
                  <option value="generated">Generated</option>
                  <option value="validated">Validated</option>
                  <option value="immutable_canon">Immutable Canon</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden">
        {showPreview ? (
          <div className="h-full overflow-y-auto p-6">
            <div className="prose prose-invert max-w-none">
              <h1 className="text-lg font-semibold text-text-primary">{frontmatter.name || "Untitled"}</h1>
              {frontmatter.tags && frontmatter.tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1">
                  {frontmatter.tags.map((tag) => (
                    <span key={tag} className="rounded bg-bg-raised px-2 py-0.5 text-xxs text-text-muted">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm text-text-secondary leading-relaxed">
                {content || "Start writing..."}
              </div>
            </div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your lore here... Use [[wikilinks]] to connect entities."
            className="h-full w-full resize-none bg-bg-base p-4 text-sm text-text-primary placeholder-text-muted focus:outline-none font-mono"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
