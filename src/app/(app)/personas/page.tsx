"use client";

import { useEffect, useState } from "react";
import { Plus, User, Trash2, Check, X, Sparkles, Save, BookOpen, MessageSquare, Settings2, FileText, Eye, EyeOff } from "lucide-react";
import { safeParse } from "@/lib/safe-json";
import { logger } from "@/lib/logger";

interface Persona {
  id: string;
  name: string;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  first_mes: string | null;
  mes_example: string | null;
  creator_notes: string | null;
  system_prompt: string | null;
  post_history_instructions: string | null;
  tags: string | null;
  writing_style: string | null;
  avatar_url: string | null;
  llm_model: string | null;
  tts_voice: string | null;
  is_active: number;
  created_at: string;
}

type TabKey = "description" | "personality" | "scenario" | "dialogue" | "advanced";

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("description");
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPersonality, setFormPersonality] = useState("");
  const [formScenario, setFormScenario] = useState("");
  const [formFirstMes, setFormFirstMes] = useState("");
  const [formMesExample, setFormMesExample] = useState("");
  const [formCreatorNotes, setFormCreatorNotes] = useState("");
  const [formSystemPrompt, setFormSystemPrompt] = useState("");
  const [formPostHistory, setFormPostHistory] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formWritingStyle, setFormWritingStyle] = useState("");
  const [formLlmModel, setFormLlmModel] = useState("");

  useEffect(() => {
    loadPersonas();
  }, []);

  async function loadPersonas() {
    try {
      const res = await fetch("/api/personas");
      const json = await res.json();
      setPersonas(json.personas || []);
    } catch (err: unknown) {
      logger.warn("Failed to load personas", err);
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setFormName("");
    setFormDescription("");
    setFormPersonality("");
    setFormScenario("");
    setFormFirstMes("");
    setFormMesExample("");
    setFormCreatorNotes("");
    setFormSystemPrompt("");
    setFormPostHistory("");
    setFormTags("");
    setFormWritingStyle("");
    setFormLlmModel("");
    setCreating(true);
    setSelectedId(null);
    setActiveTab("description");
  }

  function selectPersona(p: Persona) {
    setSelectedId(p.id);
    setCreating(false);
    setFormName(p.name);
    setFormDescription(p.description || "");
    setFormPersonality(p.personality || "");
    setFormScenario(p.scenario || "");
    setFormFirstMes(p.first_mes || "");
    setFormMesExample(p.mes_example || "");
    setFormCreatorNotes(p.creator_notes || "");
    setFormSystemPrompt(p.system_prompt || "");
    setFormPostHistory(p.post_history_instructions || "");
    setFormTags(p.tags ? (() => { const parsed = safeParse<string[]>(p.tags); return parsed ? parsed.join(", ") : p.tags; })() : "");
    setFormWritingStyle(p.writing_style || "");
    setFormLlmModel(p.llm_model || "");
    setActiveTab("description");
  }

  function cancelEdit() {
    setCreating(false);
    setSelectedId(null);
  }

  async function handleSave() {
    if (!formName.trim()) return;

    setSaving(true);
    try {
      const tags = formTags.split(",").map(t => t.trim()).filter(Boolean);
      const body = {
        name: formName,
        description: formDescription || null,
        personality: formPersonality || null,
        scenario: formScenario || null,
        firstMes: formFirstMes || null,
        mesExample: formMesExample || null,
        creatorNotes: formCreatorNotes || null,
        systemPrompt: formSystemPrompt || null,
        postHistoryInstructions: formPostHistory || null,
        tags,
        writingStyle: formWritingStyle || null,
        llmModel: formLlmModel || null,
      };

      if (creating) {
        const res = await fetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await loadPersonas();
          const json = await res.json();
          setSelectedId(json.persona.id);
          setCreating(false);
        }
      } else if (selectedId) {
        const res = await fetch(`/api/personas/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await loadPersonas();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/personas/${id}`, { method: "DELETE" });
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function handleActivate(id: string) {
    const res = await fetch(`/api/personas/${id}/activate`, { method: "PUT" });
    if (res.ok) {
      await loadPersonas();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <span className="text-xs">Loading personas...</span>
      </div>
    );
  }

  const selectedPersona = personas.find(p => p.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* Left: Persona list */}
      <div className="w-64 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-semibold text-text-primary">Personas</h1>
          <button
            onClick={startCreate}
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
              onClick={() => selectPersona(p)}
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
                    {p.is_active === 1 && (
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

      {/* Right: Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId && !creating ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <User className="mx-auto h-10 w-10 text-text-muted mb-3" />
              <p className="text-sm text-text-secondary mb-1">Select or create a persona</p>
              <p className="text-xs text-text-muted">Character cards for roleplay sessions</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-bg-raised flex items-center justify-center text-text-muted">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{formName || "New Persona"}</h2>
                  {selectedPersona?.is_active === 1 && (
                    <span className="text-[10px] text-accent">Active persona</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedId && selectedPersona?.is_active !== 1 && (
                  <button
                    onClick={() => handleActivate(selectedId)}
                    className="flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Activate
                  </button>
                )}
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight"
                >
                  {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPreview ? "Edit" : "Preview"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
                {selectedId && (
                  <button
                    onClick={() => handleDelete(selectedId)}
                    className="flex items-center gap-1 rounded-lg bg-error/10 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {creating && (
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {showPreview ? (
              <PersonaPreview
                name={formName}
                description={formDescription}
                personality={formPersonality}
                scenario={formScenario}
                firstMes={formFirstMes}
                mesExample={formMesExample}
                creatorNotes={formCreatorNotes}
                systemPrompt={formSystemPrompt}
                postHistory={formPostHistory}
                tags={formTags}
                writingStyle={formWritingStyle}
              />
            ) : (
              <>
                {/* Tabs */}
                <div className="flex gap-1 mb-3 border-b border-border-default pb-2">
                  {([
                    { key: "description", label: "Description", icon: FileText },
                    { key: "personality", label: "Personality", icon: User },
                    { key: "scenario", label: "Scenario", icon: BookOpen },
                    { key: "dialogue", label: "Dialogue", icon: MessageSquare },
                    { key: "advanced", label: "Advanced", icon: Settings2 },
                  ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
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

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                  {activeTab === "description" && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Name *</label>
                        <input
                          type="text"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="Character name"
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Description</label>
                        <p className="text-[10px] text-text-muted mb-1">Physical appearance, background, key traits. Used in the character card.</p>
                        <textarea
                          value={formDescription}
                          onChange={(e) => setFormDescription(e.target.value)}
                          placeholder="A tall, scarred warrior with piercing blue eyes..."
                          rows={6}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Tags</label>
                        <p className="text-[10px] text-text-muted mb-1">Comma-separated tags for organization</p>
                        <input
                          type="text"
                          value={formTags}
                          onChange={(e) => setFormTags(e.target.value)}
                          placeholder="fantasy, warrior, anti-hero..."
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Writing Style</label>
                        <input
                          type="text"
                          value={formWritingStyle}
                          onChange={(e) => setFormWritingStyle(e.target.value)}
                          placeholder="e.g. Formal, sarcastic, poetic..."
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "personality" && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Personality</label>
                        <p className="text-[10px] text-text-muted mb-1">Character traits, behaviors, motivations. Can be bullet points or prose.</p>
                        <textarea
                          value={formPersonality}
                          onChange={(e) => setFormPersonality(e.target.value)}
                          placeholder="Brave, stubborn, loyal to friends, distrusts authority. Has a dry sense of humor."
                          rows={8}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "scenario" && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Scenario</label>
                        <p className="text-[10px] text-text-muted mb-1">The situation or context for the character. Where are they? What&apos;s happening?</p>
                        <textarea
                          value={formScenario}
                          onChange={(e) => setFormScenario(e.target.value)}
                          placeholder="The character is a bartender in a cyberpunk city, serving drinks to mercenaries..."
                          rows={6}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "dialogue" && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">First Message</label>
                        <p className="text-[10px] text-text-muted mb-1">The opening message when starting a session with this character.</p>
                        <textarea
                          value={formFirstMes}
                          onChange={(e) => setFormFirstMes(e.target.value)}
                          placeholder="*The door creaks open as you step inside...*&#10;&#10;Welcome. I've been expecting you."
                          rows={5}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Example Dialogue</label>
                        <p className="text-[10px] text-text-muted mb-1">Example conversations showing how the character speaks. Use &lt;START&gt; for new examples.</p>
                        <textarea
                          value={formMesExample}
                          onChange={(e) => setFormMesExample(e.target.value)}
                          placeholder={`<START>\n{{user}}: "Hello there."\n{{char}}: *nods slowly* "Evening. What can I do for you?"\n\n<START>\n{{user}}: "Tell me about yourself."\n{{char}}: "Not much to tell. I keep to myself mostly."`}
                          rows={10}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "advanced" && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">System Prompt Override</label>
                        <p className="text-[10px] text-text-muted mb-1">Custom system prompt for this character. Overrides the default.</p>
                        <textarea
                          value={formSystemPrompt}
                          onChange={(e) => setFormSystemPrompt(e.target.value)}
                          placeholder="You are now playing the role of..."
                          rows={4}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Post-History Instructions</label>
                        <p className="text-[10px] text-text-muted mb-1">Instructions appended after the conversation history. Controls how the character responds.</p>
                        <textarea
                          value={formPostHistory}
                          onChange={(e) => setFormPostHistory(e.target.value)}
                          placeholder="Write in third person. Use asterisks for actions. Keep responses under 3 paragraphs."
                          rows={4}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Creator Notes</label>
                        <p className="text-[10px] text-text-muted mb-1">Personal notes about this character. Not sent to the LLM.</p>
                        <textarea
                          value={formCreatorNotes}
                          onChange={(e) => setFormCreatorNotes(e.target.value)}
                          placeholder="Based on a character from my D&D campaign. Remember to update the backstory after session 3."
                          rows={3}
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-secondary">Preferred LLM Model</label>
                        <input
                          type="text"
                          value={formLlmModel}
                          onChange={(e) => setFormLlmModel(e.target.value)}
                          placeholder="e.g. qwen3.5:4b (leave empty for default)"
                          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PersonaPreview({
  name, description, personality, scenario, firstMes, mesExample, creatorNotes, systemPrompt, postHistory, tags, writingStyle,
}: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  mesExample: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistory: string;
  tags: string;
  writingStyle: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-16 w-16 rounded-lg bg-bg-raised flex items-center justify-center text-text-muted">
            <User className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">{name || "Unnamed"}</h3>
            {tags && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {tags.split(",").map(t => t.trim()).filter(Boolean).map((t, i) => (
                  <span key={i} className="rounded-full bg-bg-raised px-2 py-0.5 text-[10px] text-text-muted">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {description && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">Description</h4>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{description}</p>
          </div>
        )}
        {personality && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">Personality</h4>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{personality}</p>
          </div>
        )}
        {writingStyle && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">Writing Style</h4>
            <p className="text-xs text-text-secondary">{writingStyle}</p>
          </div>
        )}
        {scenario && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">Scenario</h4>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{scenario}</p>
          </div>
        )}
        {firstMes && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">First Message</h4>
            <div className="rounded-lg bg-bg-raised p-3">
              <p className="text-xs text-text-secondary whitespace-pre-wrap">{firstMes}</p>
            </div>
          </div>
        )}
        {mesExample && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">Example Dialogue</h4>
            <div className="rounded-lg bg-bg-raised p-3 font-mono text-[11px] text-text-secondary whitespace-pre-wrap">{mesExample}</div>
          </div>
        )}
        {postHistory && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">Post-History Instructions</h4>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{postHistory}</p>
          </div>
        )}
        {systemPrompt && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-text-accent mb-1">System Prompt Override</h4>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{systemPrompt}</p>
          </div>
        )}
        {creatorNotes && (
          <div>
            <h4 className="text-xs font-medium text-text-muted mb-1">Creator Notes</h4>
            <p className="text-xs text-text-muted whitespace-pre-wrap">{creatorNotes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
