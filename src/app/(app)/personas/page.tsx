"use client";

import { useEffect, useState } from "react";
import { safeParse } from "@/lib/safe-json";
import { logger } from "@/lib/logger";
import type { Persona, TabKey } from "@/components/personas/persona-types";
import { PersonaList } from "@/components/personas/persona-list";
import { PersonaEditor } from "@/components/personas/persona-editor";
import { PersonaTabDescription } from "@/components/personas/persona-tab-description";
import { PersonaTabPersonality } from "@/components/personas/persona-tab-personality";
import { PersonaTabScenario } from "@/components/personas/persona-tab-scenario";
import { PersonaTabDialogue } from "@/components/personas/persona-tab-dialogue";
import { PersonaTabAdvanced } from "@/components/personas/persona-tab-advanced";
import { PersonaPreview } from "@/components/personas/persona-preview";

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
  const [formVoice, setFormVoice] = useState("");
  const [voices, setVoices] = useState<{ id: string; name: string; gender: string; language: string }[]>([]);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");

  useEffect(() => {
    loadPersonas();
    fetch("/api/tts/voices").then(r => r.json()).then(d => setVoices(d.voiceDetails || [])).catch(() => {});
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

  function handleFieldChange(field: string, value: string) {
    switch (field) {
      case "name": setFormName(value); break;
      case "description": setFormDescription(value); break;
      case "personality": setFormPersonality(value); break;
      case "scenario": setFormScenario(value); break;
      case "firstMes": setFormFirstMes(value); break;
      case "mesExample": setFormMesExample(value); break;
      case "creatorNotes": setFormCreatorNotes(value); break;
      case "systemPrompt": setFormSystemPrompt(value); break;
      case "postHistory": setFormPostHistory(value); break;
      case "tags": setFormTags(value); break;
      case "writingStyle": setFormWritingStyle(value); break;
      case "voice": setFormVoice(value); break;
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
    setFormVoice("");
    setEntityId(null);
    setAliases([]);
    setNewAlias("");
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
    setActiveTab("description");

    // Load voice assignment for this persona
    fetch(`/api/voice-assignments?entityType=persona&entityId=${p.id}`).then(r => r.json()).then(d => {
      if (d.assignment) setFormVoice(d.assignment.voiceName);
      else setFormVoice("");
    }).catch(() => setFormVoice(""));

    // Load entity registry info
    setEntityId(null);
    setAliases([]);
    setNewAlias("");
    fetch(`/api/entities?ids=persona:${p.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.entities?.[0]) {
          setEntityId(d.entities[0].id);
          setAliases(d.entities[0].aliases || []);
        }
      })
      .catch(() => {});
  }

  function cancelEdit() {
    setCreating(false);
    setSelectedId(null);
    setEntityId(null);
    setAliases([]);
    setNewAlias("");
  }

  async function handleSave() {
    if (!formName.trim()) return;

    setSaving(true);
    try {
      const tags = formTags.split(",").map((t) => t.trim()).filter(Boolean);
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
          const newId = json.persona.id;
          setSelectedId(newId);
          setCreating(false);
          // Save voice assignment for new persona
          await fetch("/api/voice-assignments", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityType: "persona", entityId: newId, voiceName: formVoice || "" }),
          });
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
        // Save voice assignment (even if empty — clears it)
        await fetch("/api/voice-assignments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "persona", entityId: selectedId, voiceName: formVoice || "" }),
        });
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

  async function handleAddAlias() {
    if (!entityId || !newAlias.trim()) return;
    await fetch(`/api/entities/${entityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aliases: [newAlias.trim()] }),
    });
    setAliases(prev => [...prev, newAlias.trim()]);
    setNewAlias("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <span className="text-xs">Loading personas...</span>
      </div>
    );
  }

  const selectedPersona = personas.find((p) => p.id === selectedId);
  const activePersonaId = personas.find((p) => p.is_active === 1)?.id ?? null;

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      <PersonaList
        personas={personas}
        selectedId={selectedId}
        onSelect={(id) => {
          const p = personas.find((x) => x.id === id);
          if (p) selectPersona(p);
        }}
        onCreateNew={startCreate}
        activePersonaId={activePersonaId}
      />

      <PersonaEditor
        isEmpty={!selectedId && !creating}
        formName={formName}
        isActive={selectedPersona?.is_active === 1}
        activeTab={activeTab}
        showPreview={showPreview}
        saving={saving}
        hasSelection={!!selectedId}
        isCreating={creating}
        onTabChange={setActiveTab}
        onSave={handleSave}
        onDelete={() => selectedId && handleDelete(selectedId)}
        onCancel={cancelEdit}
        onTogglePreview={() => setShowPreview(!showPreview)}
        onActivate={() => selectedId && handleActivate(selectedId)}
      >
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
        ) : activeTab === "description" ? (
          <PersonaTabDescription
            formName={formName}
            formDescription={formDescription}
            formTags={formTags}
            formWritingStyle={formWritingStyle}
            onChange={handleFieldChange}
          />
        ) : activeTab === "personality" ? (
          <PersonaTabPersonality
            formPersonality={formPersonality}
            onChange={handleFieldChange}
          />
        ) : activeTab === "scenario" ? (
          <PersonaTabScenario
            formScenario={formScenario}
            onChange={handleFieldChange}
          />
        ) : activeTab === "dialogue" ? (
          <PersonaTabDialogue
            formFirstMes={formFirstMes}
            formMesExample={formMesExample}
            onChange={handleFieldChange}
          />
        ) : (
          <PersonaTabAdvanced
            formSystemPrompt={formSystemPrompt}
            formPostHistory={formPostHistory}
            formCreatorNotes={formCreatorNotes}
            formVoice={formVoice}
            voices={voices}
            onChange={handleFieldChange}
            entityId={entityId}
            aliases={aliases}
            newAlias={newAlias}
            onNewAliasChange={setNewAlias}
            onAddAlias={handleAddAlias}
          />
        )}
      </PersonaEditor>
    </div>
  );
}
