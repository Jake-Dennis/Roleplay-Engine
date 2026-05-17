"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import { ArrowLeft, Save, Eye, Code, AlertTriangle, CheckCircle, Link as LinkIcon, Shield, X, History, ChevronDown, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { renderMarkdownPreview } from "@/lib/markdown-renderer";

interface LoreFile {
  type: string;
  id: string;
  name: string;
  frontmatter: Record<string, any>;
  body: string;
  content: string;
  wikilinks: { name: string; context: string }[];
}

interface Backlink {
  sourceType: string;
  sourceName: string;
  sourceId: string;
}

interface WikilinkSuggestion {
  name: string;
  type: string;
}

const CANON_OPTIONS = ["immutable_canon", "soft_canon", "generated_lore", "session_lore", "rumor"];
const CANON_LABELS: Record<string, string> = {
  immutable_canon: "Immutable Canon",
  soft_canon: "Soft Canon",
  generated_lore: "Generated Lore",
  session_lore: "Session Lore",
  rumor: "Rumor",
};
const IMPORTANCE_OPTIONS = ["low", "medium", "high", "critical"];

export default function LoreEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loreFile, setLoreFile] = useState<LoreFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showWikilinkPanel, setShowWikilinkPanel] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [brokenLinks, setBrokenLinks] = useState<string[]>([]);
  const [validLinks, setValidLinks] = useState<string[]>([]);
  const [editHistory, setEditHistory] = useState<{ id: string; username: string; oldContent: string | null; newContent: string | null; editedAt: string; editSummary: string | null }[]>([]);
  const [expandedEdit, setExpandedEdit] = useState<string | null>(null);

  // Wikilink autocomplete
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const [allEntities, setAllEntities] = useState<WikilinkSuggestion[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function loadLoreFile() {
    try {
      // Determine entity type from the URL or try all types
      const urlParams = new URLSearchParams(window.location.search);
      const entityType = urlParams.get("type") || "locations";

      const res = await fetch(`/api/lore-files?entityType=${entityType}&entityId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setLoreFile(data.file);
        setContent(data.file.content);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadAllEntities() {
    try {
      const res = await fetch("/api/lore-files");
      if (res.ok) {
        const data = await res.json();
        const entities: WikilinkSuggestion[] = (data.files || []).map((f: any) => ({
          name: f.name,
          type: f.type,
        }));
        setAllEntities(entities);
      }
    } catch {
      // ignore
    }
  }

  async function loadBacklinks() {
    try {
      const res = await fetch(`/api/backlinks?entityType=${loreFile?.type}&entityId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setBacklinks(data.backlinks || []);
      }
    } catch {
      // ignore
    }
  }

  async function loadEditHistory() {
    if (!loreFile) return;
    try {
      const res = await fetch(`/api/lore-edits?entityType=${loreFile.type}&entityId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setEditHistory(data.edits || []);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadLoreFile();
    loadAllEntities();
  }, [id]);

  useEffect(() => {
    if (loreFile) {
      loadBacklinks();
    }
  }, [loreFile]);

  // Validate wikilinks
  useEffect(() => {
    if (!content) {
      setBrokenLinks([]);
      setValidLinks([]);
      return;
    }

    const regex = /\[\[([^\]]+)\]\]/g;
    const links: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1]);
    }

    const entityNames = allEntities.map((e) => e.name.toLowerCase());
    const broken = links.filter((link) => !entityNames.includes(link.toLowerCase()));
    const valid = links.filter((link) => entityNames.includes(link.toLowerCase()));

    setBrokenLinks([...new Set(broken)]);
    setValidLinks([...new Set(valid)]);
  }, [content, allEntities]);

  // Handle textarea input for wikilink autocomplete
  const handleTextareaInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    setSaved(false);

    // Check for [[ pattern
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/\[\[([^\]]*)$/);

    if (match) {
      setAutocompleteQuery(match[1]);
      setShowAutocomplete(true);

      // Calculate position (approximate)
      const textarea = textareaRef.current;
      if (textarea) {
        const lines = textBeforeCursor.split("\n");
        const currentLine = lines.length;
        const lineHeight = 20; // approximate
        setAutocompletePos({
          top: currentLine * lineHeight,
          left: 0,
        });
      }
    } else {
      setShowAutocomplete(false);
    }
  }, []);

  const insertWikilink = useCallback((name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = content.slice(0, cursorPos);
    const textAfter = content.slice(cursorPos);

    // Find the [[ pattern
    const match = textBefore.match(/\[\[([^\]]*)$/);
    if (match) {
      const startPos = cursorPos - match[0].length;
      const newContent = content.slice(0, startPos) + `[[${name}]]` + textAfter;
      setContent(newContent);
      setShowAutocomplete(false);

      // Set cursor position after the inserted link
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(startPos + name.length + 4, startPos + name.length + 4);
      }, 0);
    }
  }, [content]);

  async function handleSave() {
    if (!loreFile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lore-files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: loreFile.type,
          entityId: loreFile.id,
          content,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  // Update frontmatter helper
  function updateFrontmatter(key: string, value: string) {
    const lines = content.split("\n");
    let inFrontmatter = false;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === "---") {
        if (inFrontmatter) break;
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter && lines[i].startsWith(`${key}:`)) {
        lines[i] = `${key}: ${value}`;
        found = true;
        break;
      }
    }

    if (!found && inFrontmatter) {
      // Add before closing ---
      const closeIdx = lines.indexOf("---", 1);
      if (closeIdx > 0) {
        lines.splice(closeIdx, 0, `${key}: ${value}`);
      }
    }

    setContent(lines.join("\n"));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
        <Code className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading editor...</span>
      </div>
    );
  }

  if (!loreFile) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
        <h3 className="text-sm font-medium text-text-primary">Lore file not found</h3>
        <Link href="/lore" className="mt-3 text-xs text-accent hover:underline">
          ← Back to Lore
        </Link>
      </div>
    );
  }

  const totalLinks = validLinks.length + brokenLinks.length;
  const validationState = brokenLinks.length === 0 && totalLinks > 0 ? "valid" : brokenLinks.length > 0 ? "errors" : "none";
  const isImmutable = loreFile.frontmatter.canon_tier === "immutable_canon";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/lore" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-base font-semibold text-text-primary">{loreFile.name}</h1>
            <p className="text-xs text-text-muted capitalize">{loreFile.type} &middot; Lore Editor</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Validation badge */}
          {validationState === "valid" && (
            <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">
              <CheckCircle className="h-3.5 w-3.5" />
              {validLinks.length} link{validLinks.length !== 1 ? "s" : ""} valid
            </span>
          )}
          {validationState === "errors" && (
            <span className="flex items-center gap-1 rounded-full bg-error/10 px-2.5 py-1 text-xs text-error">
              <AlertTriangle className="h-3.5 w-3.5" />
              {brokenLinks.length} broken link{brokenLinks.length !== 1 ? "s" : ""}
            </span>
          )}

          {/* Immutable canon badge */}
          {isImmutable && (
            <span className="flex items-center gap-1 rounded-full bg-error/10 px-2.5 py-1 text-xs text-error">
              <Lock className="h-3.5 w-3.5" />
              Immutable
            </span>
          )}

          {/* Wikilink panel toggle */}
          <button
            onClick={() => setShowWikilinkPanel(!showWikilinkPanel)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              showWikilinkPanel ? "bg-accent/10 text-accent" : "bg-bg-raised text-text-muted hover:text-text-primary"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Links ({totalLinks})
          </button>

          {/* Backlinks toggle */}
          <button
            onClick={() => { setShowBacklinks(!showBacklinks); if (!showBacklinks && backlinks.length === 0) loadBacklinks(); }}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              showBacklinks ? "bg-accent/10 text-accent" : "bg-bg-raised text-text-muted hover:text-text-primary"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5 rotate-180" />
            Back ({backlinks.length})
          </button>

          {/* History toggle */}
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory && editHistory.length === 0) loadEditHistory(); }}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              showHistory ? "bg-accent/10 text-accent" : "bg-bg-raised text-text-muted hover:text-text-primary"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History ({editHistory.length})
          </button>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              showPreview ? "bg-accent/10 text-accent" : "bg-bg-raised text-text-muted hover:text-text-primary"
            }`}
          >
            {showPreview ? <Code className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || isImmutable}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            title={isImmutable ? "Cannot edit immutable canon" : ""}
          >
            <Save className="h-3.5 w-3.5" />
            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Canon selector + importance */}
      <div className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-elevated px-4 py-2.5">
        <Shield className="h-4 w-4 text-text-muted" />
        <span className="text-xs text-text-secondary">Canon:</span>
        <select
          value={loreFile.frontmatter.canon_tier || "generated_lore"}
          onChange={(e) => updateFrontmatter("canon_tier", e.target.value)}
          disabled={isImmutable}
          className="rounded-lg border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary disabled:opacity-50"
        >
          {CANON_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{CANON_LABELS[opt] || opt}</option>
          ))}
        </select>
        <span className="text-xs text-text-secondary ml-2">Importance:</span>
        <select
          value={loreFile.frontmatter.importance || "medium"}
          onChange={(e) => updateFrontmatter("importance", e.target.value)}
          className="rounded-lg border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary"
        >
          {IMPORTANCE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
          ))}
        </select>

        {/* Sync status */}
        <div className="ml-auto flex items-center gap-1.5">
          {saved ? (
            <span className="flex items-center gap-1 text-xxs text-success">
              <CheckCircle className="h-3 w-3" />
              Frontmatter synced
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xxs text-text-muted">
              <RefreshCw className="h-3 w-3" />
              Unsaved frontmatter changes
            </span>
          )}
        </div>
      </div>

      {/* Editor + Preview */}
      <div className={`grid gap-4 ${showPreview ? "grid-cols-2" : "grid-cols-1"}`}>
        {/* Editor */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaInput}
            className="w-full h-[calc(100vh-280px)] min-h-[400px] rounded-xl border border-border-default bg-bg-elevated p-4 font-mono text-xs text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
            placeholder="Write your lore in markdown..."
            spellCheck={false}
          />

          {/* Wikilink autocomplete dropdown */}
          {showAutocomplete && (
            <div
              className="absolute z-50 rounded-lg border border-border-default bg-bg-elevated shadow-xl max-h-48 overflow-y-auto"
              style={{ top: `${autocompletePos.top}px`, left: `${autocompletePos.left}px` }}
            >
              {allEntities
                .filter((e) => e.name.toLowerCase().includes(autocompleteQuery.toLowerCase()))
                .slice(0, 10)
                .map((entity) => (
                  <button
                    key={entity.name}
                    onClick={() => insertWikilink(entity.name)}
                    className="w-full px-3 py-2 text-left text-xs text-text-primary hover:bg-bg-raised flex items-center justify-between"
                  >
                    <span>{entity.name}</span>
                    <span className="text-xxs text-text-muted capitalize">{entity.type}</span>
                  </button>
                ))}
              {allEntities.filter((e) => e.name.toLowerCase().includes(autocompleteQuery.toLowerCase())).length === 0 && (
                <div className="px-3 py-2 text-xs text-text-muted">No matches</div>
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="rounded-xl border border-border-default bg-bg-elevated p-4 overflow-y-auto h-[calc(100vh-280px)] min-h-[400px]">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Preview</h3>
            <div
              className="prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(loreFile.body || content) }}
            />
          </div>
        )}
      </div>

      {/* Wikilink panel */}
      {showWikilinkPanel && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <LinkIcon className="h-3.5 w-3.5" />
            Wikilinks ({totalLinks})
          </h3>
          <div className="flex flex-wrap gap-2">
            {validLinks.map((link) => (
              <span key={link} className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">
                <CheckCircle className="h-3 w-3" />
                {link}
              </span>
            ))}
            {brokenLinks.map((link) => (
              <span key={link} className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2.5 py-1 text-xs text-error">
                <AlertTriangle className="h-3 w-3" />
                {link}
              </span>
            ))}
            {totalLinks === 0 && (
              <span className="text-xs text-text-muted italic">No wikilinks found. Use [[Entity Name]] to link to other lore.</span>
            )}
          </div>
        </div>
      )}

      {/* Backlinks panel */}
      {showBacklinks && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <LinkIcon className="h-3.5 w-3.5 rotate-180" />
            Backlinks ({backlinks.length})
          </h3>
          {backlinks.length === 0 ? (
            <p className="text-xs text-text-muted italic">No other lore files link to this entry</p>
          ) : (
            <div className="space-y-1.5">
              {backlinks.map((bl, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-xs">
                  <span className="text-text-primary">{bl.sourceName}</span>
                  <span className="text-xxs text-text-muted capitalize">{bl.sourceType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit History panel */}
      {showHistory && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Edit History ({editHistory.length})
          </h3>
          {editHistory.length === 0 ? (
            <p className="text-xs text-text-muted italic">No edit history for this entry</p>
          ) : (
            <div className="space-y-2">
              {editHistory.map((edit) => (
                <div key={edit.id} className="rounded-lg border border-border-default bg-bg-raised">
                  <button
                    onClick={() => setExpandedEdit(expandedEdit === edit.id ? null : edit.id)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary">{edit.username}</span>
                      <span className="text-xxs text-text-muted">{new Date(edit.editedAt).toLocaleString()}</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-text-muted transition-transform ${expandedEdit === edit.id ? "rotate-180" : ""}`} />
                  </button>
                  {expandedEdit === edit.id && (
                    <div className="border-t border-border-default px-3 py-3">
                      <div className="mb-2">
                        <span className="text-xxs font-medium text-error">Before:</span>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-bg-elevated p-2 text-xxs text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">
                          {edit.oldContent || "(new entry)"}
                        </pre>
                      </div>
                      <div>
                        <span className="text-xxs font-medium text-success">After:</span>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-bg-elevated p-2 text-xxs text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">
                          {edit.newContent}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
