"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus, Users, Trash2, Sparkles, Volume2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";

interface NPC {
  id: string;
  name: string;
  cancon_status: string;
  importance: string;
  location_id: string | null;
  tags: string | null;
  created_at: string;
}

interface VoiceDetail {
  id: string;
  name: string;
  language: string;
  gender: string;
}

export default function CharactersPage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [importance, setImportance] = useState("medium");
  const [tags, setTags] = useState("");
  const [creating, setCreating] = useState(false);
  const [voices, setVoices] = useState<VoiceDetail[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [savingVoice, setSavingVoice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function loadNpcs() {
    try {
      const params = new URLSearchParams();
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const res = await fetch(`/api/npcs${params.toString() ? "?" + params.toString() : ""}`);
      const data = await res.json();
      setNpcs(data.npcs || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadVoices() {
    try {
      const res = await fetch("/api/tts/voices");
      const data = await res.json();
      setVoices(data.voiceDetails || []);
    } catch {
      // ignore
    }
  }

  async function loadAssignments() {
    try {
      const assignments: Record<string, string> = {};
      const params = new URLSearchParams();
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const npcRes = await fetch(`/api/npcs${params.toString() ? "?" + params.toString() : ""}`);
      const npcData = await npcRes.json();
      const npcList: NPC[] = npcData.npcs || [];

      for (const npc of npcList) {
        const res = await fetch(
          `/api/voice-assignments?entityType=npc&entityId=${npc.id}`
        );
        const data = await res.json();
        if (data.assignment) {
          assignments[npc.id] = data.assignment.voice_name;
        }
      }
      setAssignments(assignments);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadNpcs();
    loadVoices();
  }, [activeUniverse?.id, activeGroup?.id]);

  useEffect(() => {
    if (npcs.length > 0) {
      loadAssignments();
    }
  }, [npcs.length]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/npcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          importance,
          tags: tags.trim() ? tags.split(",").map((t) => t.trim()) : null,
          universe_id: activeUniverse?.id || null,
          group_id: activeGroup?.id || null,
        }),
      });

      if (res.ok) {
        setShowCreate(false);
        setName("");
        setImportance("medium");
        setTags("");
        await loadNpcs();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/npcs/${id}`, { method: "DELETE" });
    setNpcs((prev) => prev.filter((n) => n.id !== id));
    setDeleteTarget(null);
  }

  async function handleVoiceAssign(npcId: string, voiceName: string) {
    setSavingVoice(npcId);
    try {
      await fetch("/api/voice-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "npc",
          entityId: npcId,
          voiceName,
        }),
      });

      setAssignments((prev) => ({ ...prev, [npcId]: voiceName }));
    } finally {
      setSavingVoice(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Characters</h1>
          <p className="mt-1 text-xs text-text-muted">NPCs and character management</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Character
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4">Add Character</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                placeholder="e.g., Thrain Ironfoot"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Importance</label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                placeholder="e.g., dwarf, blacksmith, friendly"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? "Adding..." : "Add Character"}
            </button>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading characters...</span>
        </div>
      ) : npcs.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No characters</h3>
          <p className="mt-1 text-xs text-text-muted">
            Add NPCs to populate your world
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {npcs.map((npc) => {
            const tagsArray: string[] = npc.tags ? JSON.parse(npc.tags) : [];
            const currentVoice = assignments[npc.id] || "";
            return (
              <div
                key={npc.id}
                className="rounded-xl border border-border-default bg-bg-elevated p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                      <Users className="h-4 w-4 text-text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{npc.name}</p>
                      <p className="text-xxs text-text-muted mt-0.5 capitalize">
                        {npc.importance} importance
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(npc.id)}
                    className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {tagsArray.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tagsArray.map((tag, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-bg-raised px-2 py-0.5 text-xxs text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Voice assignment */}
                <div className="mt-3 flex items-center gap-2 border-t border-border-default pt-2.5">
                  <Volume2 className="h-3 w-3 text-text-muted flex-shrink-0" />
                  <select
                    value={currentVoice}
                    onChange={(e) => handleVoiceAssign(npc.id, e.target.value)}
                    disabled={savingVoice === npc.id}
                    className="flex-1 rounded border border-border-default bg-bg-raised px-2 py-1 text-xxs text-text-primary focus:border-accent"
                  >
                    <option value="">No voice</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || v.id} ({v.gender}, {v.language})
                      </option>
                    ))}
                  </select>
                  {savingVoice === npc.id && (
                    <Sparkles className="h-3 w-3 animate-pulse text-text-muted" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Character"
        message="Delete this character? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
