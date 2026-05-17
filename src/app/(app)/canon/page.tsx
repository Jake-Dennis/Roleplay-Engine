"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, Sparkles, Check, Globe, Users, MapPin, BookOpen, Layers } from "lucide-react";
import { useActiveUniverse } from "@/contexts/active-universe";
import { LayerViewer } from "@/components/canon/layer-viewer";
import { PromotionDialog } from "@/components/canon/promotion-dialog";

export const dynamic = "force-dynamic";

interface Universe {
  id: string;
  name: string;
  canon_mode: string;
  lore_source: string | null;
  tone: string | null;
  boundaries: string | null;
}

interface NPC {
  id: string;
  name: string;
  canon_status: string;
  canon_tier: string;
  canon_layer: string;
  importance: string;
  tags: string | null;
}

interface Location {
  id: string;
  name: string;
  importance: string;
  canon_layer: string;
}

interface Location {
  id: string;
  name: string;
  importance: string;
}

type TabKey = "universes" | "npcs" | "locations";

export default function CanonEditorPage() {
  const { activeUniverse } = useActiveUniverse();
  const [activeTab, setActiveTab] = useState<TabKey>("universes");
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [showPromotion, setShowPromotion] = useState(false);
  const [promotionTarget, setPromotionTarget] = useState<{ id: string; name: string; type: "npcs" | "locations"; currentLayer: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const universeParams = activeUniverse ? `?universe_id=${activeUniverse.id}` : "";
      const [uRes, nRes, lRes] = await Promise.all([
        fetch(`/api/universes`),
        fetch(`/api/npcs${universeParams}`),
        fetch(`/api/locations${universeParams}`),
      ]);
      const uData = await uRes.json();
      const nData = await nRes.json();
      const lData = await lRes.json();
      setUniverses(uData.universes || []);
      setNpcs(nData.npcs || []);
      setLocations(lData.locations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeUniverse?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function updateUniverseCanonMode(id: string, mode: string) {
    setSaving((prev) => ({ ...prev, [`universe-${id}`]: true }));
    try {
      await fetch(`/api/universes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canon_mode: mode }),
      });
      setUniverses((prev) =>
        prev.map((u) => (u.id === id ? { ...u, canon_mode: mode } : u))
      );
      setSuccess("Canon mode updated");
      setTimeout(() => setSuccess(null), 3000);
    } finally {
      setSaving((prev) => ({ ...prev, [`universe-${id}`]: false }));
    }
  }

  async function updateNPCCanonStatus(id: string, status: string) {
    setSaving((prev) => ({ ...prev, [`npc-${id}`]: true }));
    try {
      await fetch(`/api/npcs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canon_status: status }),
      });
      setNpcs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, canon_status: status } : n))
      );
      setSuccess("NPC status updated");
      setTimeout(() => setSuccess(null), 3000);
    } finally {
      setSaving((prev) => ({ ...prev, [`npc-${id}`]: false }));
    }
  }

  async function updateCanonLayer(id: string, type: "npcs" | "locations", newLayer: string) {
    setSaving((prev) => ({ ...prev, [`${type}-${id}`]: true }));
    try {
      await fetch(`/api/${type === "npcs" ? "npcs" : "locations"}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canon_layer: newLayer }),
      });
      if (type === "npcs") {
        setNpcs((prev) => prev.map((n) => (n.id === id ? { ...n, canon_layer: newLayer } : n)));
      } else {
        setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, canon_layer: newLayer } : l)));
      }
      setSuccess("Canon layer updated");
      setTimeout(() => setSuccess(null), 3000);
    } finally {
      setSaving((prev) => ({ ...prev, [`${type}-${id}`]: false }));
    }
    setShowPromotion(false);
    setPromotionTarget(null);
  }

  function openPromotion(id: string, name: string, type: "npcs" | "locations", currentLayer: string) {
    setPromotionTarget({ id, name, type, currentLayer });
    setShowPromotion(true);
  }

  // Compute layer stats
  function getLayerStats() {
    const stats = { immutable_canon: 0, soft_canon: 0, generated_lore: 0, session_lore: 0, rumor: 0 };
    const allItems = [...npcs, ...locations];
    for (const item of allItems) {
      const layer = (item as any).canon_layer || "generated_lore";
      if (layer in stats) {
        (stats as any)[layer]++;
      }
    }
    return { stats, total: allItems.length };
  }

  const canonModeDescriptions: Record<string, string> = {
    strict: "Only official lore is used. Generated content cannot contradict established canon.",
    loose: "Generated content can expand on canon but must not directly contradict major facts.",
    custom: "Define your own rules for what counts as canon.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold text-text-primary">Canon Editor</h1>
        <p className="mt-1 text-xs text-text-muted">Manage canon layers and entity status</p>
      </div>

      {success && (
        <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
          <Check className="h-3.5 w-3.5" />
          {success}
        </div>
      )}

      {/* Layer Overview */}
      {!loading && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-medium text-text-primary">Canon Layer Distribution</h2>
          </div>
          <LayerViewer {...getLayerStats()} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-bg-raised p-1">
        {([
          { key: "universes", label: "Universes", icon: Globe },
          { key: "npcs", label: "NPCs", icon: Users },
          { key: "locations", label: "Locations", icon: MapPin },
        ] as { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(
          ({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === key
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading canon data...</span>
        </div>
      ) : (
        <>
          {/* Universes Tab */}
          {activeTab === "universes" && (
            <div className="space-y-3">
              {universes.length === 0 ? (
                <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
                  <Globe className="mx-auto h-10 w-10 text-text-muted" />
                  <h3 className="mt-3 text-sm font-medium text-text-primary">No universes</h3>
                  <p className="mt-1 text-xs text-text-muted">Create a universe to manage canon modes</p>
                </div>
              ) : (
                universes.map((u) => (
                  <div key={u.id} className="rounded-xl border border-border-default bg-bg-elevated p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <Shield className="h-4 w-4 text-text-accent" />
                      <h2 className="text-sm font-medium text-text-primary">{u.name}</h2>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1.5 block text-xs text-text-secondary">Canon Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                          {["strict", "loose", "custom"].map((mode) => (
                            <button
                              key={mode}
                              onClick={() => updateUniverseCanonMode(u.id, mode)}
                              disabled={saving[`universe-${u.id}`]}
                              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                u.canon_mode === mode
                                  ? "border-accent bg-accent/10 text-accent"
                                  : "border-border-default bg-bg-raised text-text-muted hover:text-text-primary"
                              } disabled:opacity-50`}
                            >
                              {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-xxs text-text-muted">
                          {canonModeDescriptions[u.canon_mode]}
                        </p>
                      </div>

                      {u.tone && (
                        <div className="flex items-center gap-2 rounded-lg bg-bg-raised px-3.5 py-2.5">
                          <BookOpen className="h-3.5 w-3.5 text-text-muted" />
                          <span className="text-xs text-text-secondary">Tone:</span>
                          <span className="text-xs text-text-primary">{u.tone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* NPCs Tab */}
          {activeTab === "npcs" && (
            <div className="space-y-2">
              {npcs.length === 0 ? (
                <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
                  <Users className="mx-auto h-10 w-10 text-text-muted" />
                  <h3 className="mt-3 text-sm font-medium text-text-primary">No NPCs</h3>
                  <p className="mt-1 text-xs text-text-muted">NPCs will appear here when created</p>
                </div>
              ) : (
                npcs.map((npc) => (
                  <div key={npc.id} className="flex items-center justify-between rounded-xl border border-border-default bg-bg-elevated p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          npc.canon_status === "canon"
                            ? "bg-accent/10"
                            : npc.canon_status === "generated"
                            ? "bg-amber-500/10"
                            : "bg-bg-raised"
                        }`}
                      >
                        <Users
                          className={`h-3.5 w-3.5 ${
                            npc.canon_status === "canon"
                              ? "text-accent"
                              : npc.canon_status === "generated"
                              ? "text-amber-500"
                              : "text-text-muted"
                          }`}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{npc.name}</p>
                        <div className="flex items-center gap-2 text-xxs text-text-muted">
                          <span
                            className={`rounded-full px-1.5 py-0.5 ${
                              npc.canon_status === "canon"
                                ? "bg-accent/10 text-accent"
                                : npc.canon_status === "generated"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-bg-raised text-text-muted"
                            }`}
                          >
                            {npc.canon_status}
                          </span>
                          <span className="capitalize">{npc.importance}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openPromotion(npc.id, npc.name, "npcs", npc.canon_tier || npc.canon_layer || "generated_lore")}
                        disabled={saving[`npcs-${npc.id}`]}
                        className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 text-xxs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
                      >
                        <Layers className="h-3 w-3" />
                        Layer
                      </button>
                      {npc.canon_status !== "canon" && (
                        <button
                          onClick={() => updateNPCCanonStatus(npc.id, "canon")}
                          disabled={saving[`npc-${npc.id}`]}
                          className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xxs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
                        >
                          <Shield className="h-3 w-3" />
                          Promote
                        </button>
                      )}
                      {npc.canon_status !== "generated" && (
                        <button
                          onClick={() => updateNPCCanonStatus(npc.id, "generated")}
                          disabled={saving[`npc-${npc.id}`]}
                          className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 text-xxs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
                        >
                          Demote
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Locations Tab */}
          {activeTab === "locations" && (
            <div className="space-y-2">
              {locations.length === 0 ? (
                <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
                  <MapPin className="mx-auto h-10 w-10 text-text-muted" />
                  <h3 className="mt-3 text-sm font-medium text-text-primary">No locations</h3>
                  <p className="mt-1 text-xs text-text-muted">Locations will appear here when created</p>
                </div>
              ) : (
                locations.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between rounded-xl border border-border-default bg-bg-elevated p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                        <MapPin className="h-3.5 w-3.5 text-text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{loc.name}</p>
                        <div className="flex items-center gap-2 text-xxs text-text-muted">
                          <span className="capitalize">{loc.importance}</span>
                          {loc.canon_layer && (
                            <>
                              <span>·</span>
                              <span className="capitalize">{loc.canon_layer.replace("_", " ")}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => openPromotion(loc.id, loc.name, "locations", loc.canon_layer || "generated_lore")}
                      disabled={saving[`locations-${loc.id}`]}
                      className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 text-xxs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
                    >
                      <Layers className="h-3 w-3" />
                      Layer
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Promotion Dialog */}
      {promotionTarget && (
        <PromotionDialog
          open={showPromotion}
          currentLayer={promotionTarget.currentLayer}
          entityName={promotionTarget.name}
          entityType={promotionTarget.type}
          onConfirm={(newLayer) => updateCanonLayer(promotionTarget.id, promotionTarget.type, newLayer)}
          onClose={() => { setShowPromotion(false); setPromotionTarget(null); }}
        />
      )}
    </div>
  );
}
