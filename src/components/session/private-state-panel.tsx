"use client";

/**
 * PrivateStatePanel Component
 *
 * Slide-in panel for group session participants to manage private thoughts,
 * personal relationship views, and individual narrative memories.
 *
 * Private state is stored in session_participants.private_state (JSON column)
 * and is NEVER broadcast via SSE — only visible to the current user.
 *
 * Usage:
 *   <PrivateStatePanel
 *     sessionId={sessionId}
 *     onClose={() => setShowPrivatePanel(false)}
 *   />
 */

import { useState, useEffect, useCallback, memo } from "react";
import { Lock, MessageSquare, Heart, Bookmark, X } from "lucide-react";
import { PrivateThoughts } from "./private-thoughts";
import { PersonalRelationships } from "./personal-relationships";
import { IndividualMemories } from "./individual-memories";

interface PrivateState {
  thoughts: PrivateThought[];
  relationships: Record<string, PersonalRelationship>;
  memories: IndividualMemory[];
}

interface PrivateThought {
  id: string;
  content: string;
  timestamp: string;
}

interface PersonalRelationship {
  targetName: string;
  emotionOverrides: Record<string, number>;
  notes: string;
}

interface IndividualMemory {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  promoted: boolean;
}

type TabKey = "thoughts" | "relationships" | "memories";

interface PrivateStatePanelProps {
  sessionId: string;
  onClose: () => void;
}

export const PrivateStatePanel = memo(function PrivateStatePanel({ sessionId, onClose }: PrivateStatePanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("thoughts");
  const [state, setState] = useState<PrivateState>({
    thoughts: [],
    relationships: {},
    memories: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load private state on mount
  useEffect(() => {
    async function loadState() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/private-state`);
        if (res.ok) {
          const json = await res.json();
          setState({
            thoughts: json.privateState?.thoughts || [],
            relationships: json.privateState?.relationships || {},
            memories: json.privateState?.memories || [],
          });
        }
      } catch {
        // Silently fail — private state is optional
      } finally {
        setLoading(false);
      }
    }
    loadState();
  }, [sessionId]);

  // Save state to API
  const saveState = useCallback(
    async (newState: PrivateState) => {
      setState(newState);
      setSaving(true);
      try {
        await fetch(`/api/sessions/${sessionId}/private-state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: newState }),
        });
      } catch {
        // Silently fail — will retry on next save
      } finally {
        setSaving(false);
      }
    },
    [sessionId]
  );

  // Persist panel open/closed state in localStorage
  useEffect(() => {
    localStorage.setItem("private-panel-open", "true");
    return () => localStorage.setItem("private-panel-open", "false");
  }, []);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "thoughts", label: "Thoughts", icon: <MessageSquare className="h-3 w-3" /> },
    { key: "relationships", label: "Relationships", icon: <Heart className="h-3 w-3" /> },
    { key: "memories", label: "Memories", icon: <Bookmark className="h-3 w-3" /> },
  ];

  if (loading) {
    return (
      <div className="border-b border-border-default bg-bg-raised px-4 py-3">
        <div className="flex items-center justify-center py-8 text-text-muted">
          <span className="text-xs">Loading private state...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border-default bg-bg-raised">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-accent" />
          <h3 className="text-xs font-semibold text-text-primary">Private State</h3>
          {saving && (
            <span className="text-xxs text-text-muted animate-pulse">Saving...</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
          title="Close private panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border-default">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xxs font-medium transition-colors ${
              activeTab === tab.key
                ? "text-accent border-b-2 border-accent bg-bg-elevated/50"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-elevated/30"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-3 max-h-96 overflow-y-auto">
        {activeTab === "thoughts" && (
          <PrivateThoughts
            thoughts={state.thoughts}
            onChange={(thoughts) => saveState({ ...state, thoughts })}
          />
        )}
        {activeTab === "relationships" && (
          <PersonalRelationships
            relationships={state.relationships}
            onChange={(relationships) => saveState({ ...state, relationships })}
          />
        )}
        {activeTab === "memories" && (
          <IndividualMemories
            memories={state.memories}
            onChange={(memories) => saveState({ ...state, memories })}
          />
        )}
      </div>
    </div>
  );
});
