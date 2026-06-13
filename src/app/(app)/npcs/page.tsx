"use client";

import { useEffect, useState, useCallback } from "react";
import { NpcList } from "@/components/npcs/npc-list";
import { NpcEditor } from "@/components/npcs/npc-editor";
import { logger } from "@/lib/logger";

interface Npc {
  id: string;
  entityId?: string | null;
  name: string;
  description: string | null;
  personalityTraits: string | null;
  behaviorPatterns: string | null;
  voiceId: string | null;
  isCanon: number;
  universeId: string | null;
  createdAt: string;
}

interface Universe {
  id: string;
  name: string;
}

export default function NpcsPage() {
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [universeFilter, setUniverseFilter] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPersonalityTraits, setFormPersonalityTraits] = useState("");
  const [formBehaviorPatterns, setFormBehaviorPatterns] = useState("");
  const [formVoiceId, setFormVoiceId] = useState("");
  const [formIsCanon, setFormIsCanon] = useState(false);
  const [formUniverseId, setFormUniverseId] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");

  const loadNpcs = useCallback(async () => {
    try {
      const res = await fetch("/api/npcs");
      const json = await res.json();
      setNpcs(json.npcs || []);
    } catch (err: unknown) {
      logger.warn("Failed to load NPCs", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUniverses = useCallback(async () => {
    try {
      const res = await fetch("/api/universes");
      const json = await res.json();
      setUniverses(json.universes || []);
    } catch (err: unknown) {
      logger.warn("Failed to load universes", err);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { loadNpcs(); loadUniverses(); });
  }, [loadNpcs, loadUniverses]);

  function startCreate() {
    setFormName("");
    setFormDescription("");
    setFormPersonalityTraits("");
    setFormBehaviorPatterns("");
    setFormVoiceId("");
    setFormIsCanon(false);
    setFormUniverseId(universeFilter || "");
    setEntityId(null);
    setAliases([]);
    setNewAlias("");
    setCreating(true);
    setSelectedId(null);
  }

  function selectNpc(npc: Npc) {
    setSelectedId(npc.id);
    setCreating(false);
    setFormName(npc.name);
    setFormDescription(npc.description || "");
    setFormPersonalityTraits(npc.personalityTraits || "");
    setFormBehaviorPatterns(npc.behaviorPatterns || "");
    setFormVoiceId(npc.voiceId || "");
    setFormIsCanon(npc.isCanon === 1);
    setFormUniverseId(npc.universeId || "");

    // Load entity registry info
    setEntityId(null);
    setAliases([]);
    setNewAlias("");
    fetch(`/api/entities?ids=npc:${npc.id}`)
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
      const body = {
        name: formName,
        description: formDescription || null,
        personalityTraits: formPersonalityTraits || null,
        behaviorPatterns: formBehaviorPatterns || null,
        voiceId: formVoiceId || null,
        isCanon: formIsCanon,
        universeId: formUniverseId || null,
      };

      if (creating) {
        const res = await fetch("/api/npcs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await loadNpcs();
          const json = await res.json();
          setSelectedId(json.npc.id);
          setCreating(false);
        }
      } else if (selectedId) {
        const res = await fetch(`/api/npcs/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await loadNpcs();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/npcs/${id}`, { method: "DELETE" });
    setNpcs((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
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
        <span className="text-xs">Loading NPCs...</span>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      <NpcList
        npcs={npcs}
        universes={universes}
        selectedId={selectedId}
        searchQuery={searchQuery}
        universeFilter={universeFilter}
        onSelect={selectNpc}
        onSearchChange={setSearchQuery}
        onUniverseFilterChange={setUniverseFilter}
        onCreateNew={startCreate}
      />

      <NpcEditor
        selectedId={selectedId}
        creating={creating}
        formName={formName}
        formDescription={formDescription}
        formPersonalityTraits={formPersonalityTraits}
        formBehaviorPatterns={formBehaviorPatterns}
        formVoiceId={formVoiceId}
        formIsCanon={formIsCanon}
        formUniverseId={formUniverseId}
        universes={universes}
        saving={saving}
        entityId={entityId}
        aliases={aliases}
        newAlias={newAlias}
        onNewAliasChange={setNewAlias}
        onAddAlias={handleAddAlias}
        onNameChange={setFormName}
        onDescriptionChange={setFormDescription}
        onPersonalityTraitsChange={setFormPersonalityTraits}
        onBehaviorPatternsChange={setFormBehaviorPatterns}
        onVoiceIdChange={setFormVoiceId}
        onIsCanonChange={setFormIsCanon}
        onUniverseIdChange={setFormUniverseId}
        onSave={handleSave}
        onDelete={handleDelete}
        onCancel={cancelEdit}
      />
    </div>
  );
}
