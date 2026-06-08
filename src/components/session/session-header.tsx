"use client";

/**
 * SessionHeader Component
 *
 * Displays session name, persona selector, toggle buttons for panels,
 * message count, ChatSearch, and ChatExport.
 */

import { useState, useEffect, useRef, memo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Users,
  Lock,
  Heart,
  Sparkles,
  User,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ChatSearch } from "@/components/chat/chat-search";
import { ChatExport } from "@/components/chat/chat-export";

interface SessionHeaderProps {
  sessionId: string;
  sessionName: string;
  messageCount: number;
  isGroup: boolean;
  personas: { id: string; name: string }[];
  personasLoading: boolean;
  activePersonaId: string | null;
  hasSceneState: boolean;
  showScenePanel: boolean;
  showParticipantPanel: boolean;
  showPrivatePanel: boolean;
  showRelationshipTimeline: boolean;
  showRecapPanel: boolean;
  activeLocationId?: string | null;
  onPersonaChange: (personaId: string | null) => void;
  onToggleScenePanel: () => void;
  onToggleParticipantPanel: () => void;
  onTogglePrivatePanel: () => void;
  onToggleRelationshipTimeline: () => void;
  onToggleRecapPanel: () => void;
}

export const SessionHeader = memo(function SessionHeader({
  sessionId,
  sessionName,
  messageCount,
  isGroup,
  personas,
  personasLoading,
  activePersonaId,
  hasSceneState,
  showScenePanel,
  showParticipantPanel,
  showPrivatePanel,
  showRelationshipTimeline,
  showRecapPanel,
  activeLocationId,
  onPersonaChange,
  onToggleScenePanel,
  onToggleParticipantPanel,
  onTogglePrivatePanel,
  onToggleRelationshipTimeline,
  onToggleRecapPanel,
}: SessionHeaderProps) {
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const personaDropdownRef = useRef<HTMLDivElement>(null);

  // Click-outside handler for persona dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(e.target as Node)) {
        setShowPersonaSelector(false);
      }
    }
    if (showPersonaSelector) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showPersonaSelector]);

  return (
    <div className="shrink-0 flex items-center justify-between border-b border-border-default pb-3">
      <div className="flex items-center gap-3">
        <Link
          href="/session"
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-text-primary">
              {sessionName}
            </h1>
            {/* Persona selector */}
            <div ref={personaDropdownRef} className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowPersonaSelector(!showPersonaSelector); }}
                className="flex items-center gap-1 rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-accent"
                title="Change persona"
              >
                <User className="h-3 w-3" />
                {personasLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="text-xxs max-w-[120px] truncate">
                    {personas.find(p => p.id === activePersonaId)?.name || "No persona"}
                  </span>
                )}
                {showPersonaSelector ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showPersonaSelector && (
                <div className="absolute left-0 top-full mt-1 min-w-[180px] rounded-lg border border-border-default bg-bg-elevated shadow-lg z-10">
                  {personasLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </div>
                  ) : personas.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-text-muted">
                      No personas.{" "}
                      <Link href="/personas" className="text-accent hover:underline">
                        Create persona
                      </Link>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { onPersonaChange(null); setShowPersonaSelector(false); }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          !activePersonaId ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-raised"
                        }`}
                      >
                        No persona (username)
                      </button>
                      {personas.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { onPersonaChange(p.id); setShowPersonaSelector(false); }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            p.id === activePersonaId ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-raised"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Scene State button */}
            {hasSceneState && (
              <button
                onClick={onToggleScenePanel}
                className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                  showScenePanel ? "text-accent" : "text-text-muted hover:text-accent"
                }`}
                title="Scene State"
              >
                <MapPin className="h-3 w-3" />
              </button>
            )}
            {/* Participants button (group sessions) */}
            {isGroup && (
              <button
                onClick={onToggleParticipantPanel}
                className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                  showParticipantPanel ? "text-accent" : "text-text-muted hover:text-accent"
                }`}
                title="Participants"
              >
                <Users className="h-3 w-3" />
              </button>
            )}
            {/* Private State button */}
            <button
              onClick={onTogglePrivatePanel}
              className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                showPrivatePanel ? "text-accent" : "text-text-muted hover:text-accent"
              }`}
              title="Private State"
            >
              <Lock className="h-3 w-3" />
            </button>
            {/* Relationship Timeline button */}
            <button
              onClick={onToggleRelationshipTimeline}
              className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                showRelationshipTimeline ? "text-accent" : "text-text-muted hover:text-accent"
              }`}
              title="Relationship Timeline"
            >
              <Heart className="h-3 w-3" />
            </button>
            {/* Recap button */}
            <button
              onClick={onToggleRecapPanel}
              className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                showRecapPanel ? "text-accent" : "text-text-muted hover:text-accent"
              }`}
              title="Session Recap"
            >
              <Sparkles className="h-3 w-3" />
            </button>
            <ChatExport sessionId={sessionId} />
          </div>
          <p className="text-xxs text-text-muted">
            {messageCount} message{messageCount !== 1 ? "s" : ""}
            {activeLocationId && ` · ${activeLocationId}`}
          </p>
        </div>
      </div>
      <ChatSearch sessionId={sessionId} />
    </div>
  );
});
