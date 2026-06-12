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
  ScrollText,
  User,
  Loader2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  X,
  MessageSquare,
} from "lucide-react";
import { ChatSearch } from "@/components/chat/chat-search";
import { ChatExport } from "@/components/chat/chat-export";
import { NarratorStyleInline } from "@/components/session/narrator-style-inline";
import { ConversationLog } from "@/components/session/conversation-log";

interface SessionHeaderProps {
  sessionId: string;
  sessionName: string;
  messageCount: number;
  contextTokens?: number;
  contextWindow?: number;
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
  contextTokens,
  contextWindow,
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
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(sessionName);
  const [nameSaving, setNameSaving] = useState(false);
  const [showConversationLog, setShowConversationLog] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  useEffect(() => { setEditName(sessionName); }, [sessionName]);

  const handleSaveName = async () => {
    if (!editName.trim() || editName === sessionName) { setEditingName(false); return; }
    setNameSaving(true);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
    } catch { /* ignore */ }
    setNameSaving(false);
    setEditingName(false);
  };

  const handleCancelName = () => {
    setEditName(sessionName);
    setEditingName(false);
  };

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
            {editingName ? (
              <div className="flex items-center gap-1">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") handleCancelName(); }}
                  className="rounded border border-border-default bg-bg-raised px-2 py-0.5 text-sm text-text-primary w-48 focus:outline-none focus:border-accent"
                />
                <button onClick={handleSaveName} disabled={nameSaving} className="p-1 text-text-muted hover:text-text-primary">
                  {nameSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={handleCancelName} className="p-1 text-text-muted hover:text-text-primary">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-sm font-semibold text-text-primary">
                  {sessionName}
                </h1>
                <button
                  onClick={() => setEditingName(true)}
                  className="p-1 text-text-muted hover:text-text-primary transition-colors"
                  title="Rename session"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </>
            )}
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
            {/* Conversation Log button */}
            <button
              onClick={() => setShowConversationLog(true)}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-accent"
              title="Conversation log"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            {/* Narrator Style button */}
            <NarratorStyleInline sessionId={sessionId} />
            <ChatExport sessionId={sessionId} />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xxs text-text-muted">
              {messageCount} message{messageCount !== 1 ? "s" : ""}
            </p>
            {contextTokens !== undefined && contextWindow && (
              <>
                <div className="h-3 w-px bg-border-default" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-16 rounded-full bg-bg-raised overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        (contextTokens / contextWindow) > 0.9 ? "bg-status-error"
                        : (contextTokens / contextWindow) > 0.7 ? "bg-warning"
                        : "bg-accent"
                      }`}
                      style={{ width: `${Math.min(100, Math.round((contextTokens / contextWindow) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xxs text-text-muted tabular-nums">
                    ~{(contextTokens / 1000).toFixed(0)}K / {contextWindow >= 1000000 ? `${(contextWindow / 1000000).toFixed(0)}M` : `${(contextWindow / 1000).toFixed(0)}K`}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <ChatSearch sessionId={sessionId} />

      {showConversationLog && (
        <ConversationLog
          sessionId={sessionId}
          onClose={() => setShowConversationLog(false)}
        />
      )}
    </div>
  );
});
