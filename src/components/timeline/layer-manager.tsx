"use client";

/**
 * LayerManager Component
 *
 * Tabbed interface for managing timeline layers: Eras, Factions, Active Characters.
 * Used in the timeline detail page to manage layers separately from timeline entries.
 */

import { useState, useEffect, useCallback } from "react";
import { Calendar, Users, UserCheck, Plus, Loader2 } from "lucide-react";
import { EraEditor } from "./era-editor";
import { FactionEditor } from "./faction-editor";
import { CharacterEditor } from "./character-editor";

type LayerType = "era" | "faction" | "active_characters";

interface TimelineLayer {
  id: string;
  layer_type: LayerType;
  name: string;
  description: string | null;
  start_year: number | null;
  end_year: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface LayerManagerProps {
  timelineId: string;
}

export function LayerManager({ timelineId }: LayerManagerProps) {
  const [activeTab, setActiveTab] = useState<LayerType>("era");
  const [layers, setLayers] = useState<TimelineLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadLayers = useCallback(async () => {
    try {
      const res = await fetch(`/api/timelines/${timelineId}/layers?layerType=${activeTab}`);
      if (res.ok) {
        const data = await res.json();
        setLayers(data.layers || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [timelineId, activeTab]);

  useEffect(() => { loadLayers(); }, [loadLayers]);

  const tabs: { key: LayerType; label: string; icon: React.ReactNode }[] = [
    { key: "era", label: "Eras", icon: <Calendar className="h-3 w-3" /> },
    { key: "faction", label: "Factions", icon: <Users className="h-3 w-3" /> },
    { key: "active_characters", label: "Characters", icon: <UserCheck className="h-3 w-3" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-border-default">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setShowAddForm(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "text-accent border-b-2 border-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Add button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Add {activeTab === "era" ? "Era" : activeTab === "faction" ? "Faction" : "Character"}
        </button>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-xs">Loading layers...</span>
        </div>
      ) : (
        <>
          {activeTab === "era" && (
            <EraEditor
              layers={layers}
              timelineId={timelineId}
              showAddForm={showAddForm}
              onAddComplete={() => { setShowAddForm(false); loadLayers(); }}
              onCancelAdd={() => setShowAddForm(false)}
              onUpdate={() => loadLayers()}
            />
          )}
          {activeTab === "faction" && (
            <FactionEditor
              layers={layers}
              timelineId={timelineId}
              showAddForm={showAddForm}
              onAddComplete={() => { setShowAddForm(false); loadLayers(); }}
              onCancelAdd={() => setShowAddForm(false)}
              onUpdate={() => loadLayers()}
            />
          )}
          {activeTab === "active_characters" && (
            <CharacterEditor
              layers={layers}
              timelineId={timelineId}
              showAddForm={showAddForm}
              onAddComplete={() => { setShowAddForm(false); loadLayers(); }}
              onCancelAdd={() => setShowAddForm(false)}
              onUpdate={() => loadLayers()}
            />
          )}
        </>
      )}
    </div>
  );
}
