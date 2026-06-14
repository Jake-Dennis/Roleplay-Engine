"use client";

import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Compass,
  Swords,
  MessageCircle,
  Search,
  Moon,
  Footprints,
  Wand2,
  Sparkles,
} from "lucide-react";

import type { Intent } from "@/lib/intent-analyzer";
import { useSession } from "@/hooks/use-session";
import { useSessionChat } from "@/hooks/use-session-chat";
import { useApp } from "@/contexts/app-context";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { WikiToast } from "@/components/ui/wiki-toast";
import { ChatWindow } from "@/components/chat/chat-window";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { SessionHeader } from "@/components/session/session-header";
import { GenerationErrorBanner } from "@/components/session/generation-error-banner";
import { ParticipantList } from "@/components/session/participant-list";
import { CharacterDeclarationModal } from "@/components/session/character-declaration-modal";
import { SceneStatePanel } from "@/components/session/scene-state-panel";
import { PrivateStatePanel } from "@/components/session/private-state-panel";
import { SessionRecapPanel } from "@/components/session/session-recap-panel";
import { RelationshipTimeline } from "@/components/relationships/relationship-timeline";
import { NarrativeStatePanel } from "@/components/debug/narrative-state-panel";

export default function SessionChatPage() {
  const params = useParams();
  const sessionId = params.id as string;

  // H2: Use useSession hook for session state management
  const {
    state,
    refresh: refreshSession,
    claimTurn,
    advanceTurn,
  } = useSession(sessionId);

  // Set session context so sidebar locks to this session's universe
  const { setActiveSession, refreshAll } = useApp();

  // Extract all chat logic into a reusable hook
  const chat = useSessionChat(sessionId, state, refreshSession, claimTurn, advanceTurn);

  // Set active session in app context
  useEffect(() => {
    if (state.session) {
      // API returns camelCase keys; handle both formats
      const sess = state.session as { universe_id?: string | null; universeId?: string | null; group_id?: string | null; groupId?: string | null };
      setActiveSession({
        id: state.session.id,
        name: state.session.name,
        type: state.session.type || "solo",
        group_id: sess.group_id ?? sess.groupId ?? null,
        universe_id: sess.universe_id ?? sess.universeId ?? null,
      });
      refreshAll();
    }
  }, [state.session, refreshAll, setActiveSession]);

  // Memoized intent icon mapping
  const intentIcons = useMemo<Record<Intent, React.ReactNode>>(() => ({
    exploration: <Compass className="h-3 w-3" />,
    combat: <Swords className="h-3 w-3" />,
    social: <MessageCircle className="h-3 w-3" />,
    investigation: <Search className="h-3 w-3" />,
    rest: <Moon className="h-3 w-3" />,
    travel: <Footprints className="h-3 w-3" />,
    ritual: <Wand2 className="h-3 w-3" />,
  }), []);

  // Handle confirm/cancel from dialogs
  const handleConfirmDelete = () => {
    if (chat.confirmAction?.id) {
      chat.handleDelete(chat.confirmAction.id);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading session...</span>
      </div>
    );
  }

  if (state.error || !state.session) {
    return (
      <div className="text-center py-20 text-text-muted text-xs">Session not found</div>
    );
  }

  const allMessages = state.messages || [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <SessionHeader
        sessionId={sessionId}
        sessionName={state.session.name}
        messageCount={allMessages.length}
        isGroup={chat.isGroup}
        personas={chat.personas}
        personasLoading={chat.personasLoading}
        activePersonaId={chat.activePersonaId}
        hasSceneState={!!state.sceneState}
        showScenePanel={chat.showScenePanel}
        showParticipantPanel={chat.showParticipantPanel}
        showPrivatePanel={chat.showPrivatePanel}
        showRelationshipTimeline={chat.showRelationshipTimeline}
        showRecapPanel={chat.showRecapPanel}
        activeLocationId={state.sceneState?.active_location_id}
        onPersonaChange={chat.handlePersonaChange}
        onToggleScenePanel={() => chat.setShowScenePanel(!chat.showScenePanel)}
        onToggleParticipantPanel={() => chat.setShowParticipantPanel(!chat.showParticipantPanel)}
        onTogglePrivatePanel={() => chat.setShowPrivatePanel(!chat.showPrivatePanel)}
        onToggleRelationshipTimeline={() => chat.setShowRelationshipTimeline(!chat.showRelationshipTimeline)}
        onToggleRecapPanel={() => chat.setShowRecapPanel(!chat.showRecapPanel)}
      />

      {/* Scene State Panel */}
      {chat.showScenePanel && (
        <div className="shrink-0">
          <SceneStatePanel
            scene={state.sceneState}
            onSave={(data) => chat.handleSceneSave(data)}
            onClose={() => chat.setShowScenePanel(false)}
          />
        </div>
      )}

      {/* Participant Panel (group sessions) */}
      {chat.showParticipantPanel && chat.isGroup && (
        <div className="shrink-0">
          <ParticipantList
            participants={state.participants}
            isOwner={state.isOwner}
            turnConfig={state.turnConfig}
            onInvite={chat.handleInvite}
            onKick={chat.handleKick}
            onLeave={() => chat.setConfirmAction({ type: "leave" })}
            onSetTurnMode={chat.handleSetTurnMode}
            onAdvanceTurn={chat.handleAdvanceTurn}
            onClaimTurn={chat.handleClaimTurn}
            onRoleChange={chat.handleRoleChange}
            onClose={() => chat.setShowParticipantPanel(false)}
          />
        </div>
      )}

      {/* Private State Panel */}
      {chat.showPrivatePanel && (
        <div className="shrink-0">
          <PrivateStatePanel
            sessionId={sessionId}
            onClose={() => chat.setShowPrivatePanel(false)}
          />
        </div>
      )}

      {/* Relationship Timeline Panel */}
      {chat.showRelationshipTimeline && (
        <div className="shrink-0">
          <RelationshipTimeline
            sessionId={sessionId}
            sessionUniverseId={state.session?.universe_id}
            onClose={() => chat.setShowRelationshipTimeline(false)}
          />
        </div>
      )}

      {/* Session Recap Panel */}
      {chat.showRecapPanel && (
        <div className="shrink-0">
          <SessionRecapPanel
            sessionId={sessionId}
            onClose={() => chat.setShowRecapPanel(false)}
          />
        </div>
      )}

      {/* Generation Error Banner */}
      <GenerationErrorBanner
        message={chat.generationError}
        onDismiss={() => chat.setGenerationError(null)}
      />

      {/* Typing Indicator */}
      {chat.streaming && !chat.streamContent && (
        <div className="shrink-0"><TypingIndicator /></div>
      )}

      {/* Chat Window */}
      <ChatWindow
        messages={allMessages}
        isStreaming={chat.streaming}
        streamingContent={chat.streamContent}
        input={chat.input}
        editingId={chat.editingId}
        editContent={chat.editContent}
        copiedId={chat.copiedId}
        ttsPlayingId={chat.ttsPlayingId}
        intentIcons={intentIcons}
        onCopy={chat.handleCopy}
        onStartEdit={chat.handleStartEdit}
        onSaveEdit={chat.handleSaveEdit}
        onCancelEdit={() => chat.setEditingId(null)}
        onDelete={(id) => chat.setConfirmAction({ type: "delete", id })}
        onRegenerate={chat.handleRegenerate}
        onTtsPlay={chat.handleTtsPlay}
        onEditContentChange={chat.setEditContent}
        onShowEditHistory={chat.setEditHistoryMessageId}
        onSend={chat.handleSend}
        onInputChange={chat.setInput}
        onKeyDown={chat.handleKeyDown}
        scrollRef={chat.messagesEndRef}
        inputRef={chat.inputRef}
        sessionId={sessionId}
        editHistoryMessageId={chat.editHistoryMessageId}
        onEditHistoryClose={() => chat.setEditHistoryMessageId(null)}
        disabled={state.isObserver}
        choices={chat.choices}
        onChoiceSelect={chat.handleChoiceSelect}
        onRegenerateChoices={chat.handleRegenerateChoices}
        isRegeneratingChoices={chat.isRegeneratingChoices}
      />

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={chat.confirmAction?.type === "leave"}
        onClose={() => chat.setConfirmAction(null)}
        onConfirm={chat.handleLeave}
        title="Leave Session"
        message="Are you sure you want to leave this session?"
        confirmVariant="danger"
      />
      <ConfirmationDialog
        open={chat.confirmAction?.type === "delete"}
        onClose={() => chat.setConfirmAction(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Message"
        message="Delete this message and all subsequent messages? This cannot be undone."
        confirmVariant="danger"
      />

      {/* Character Declaration Modal */}
      <CharacterDeclarationModal
        open={chat.showCharacterModal}
        sessionId={sessionId}
        takenCharacters={state.participants
          .filter((p) => p.character_name)
          .map((p) => p.character_name!)}
        onJoin={async (characterName) => {
          const res = await fetch(`/api/sessions/${sessionId}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ character_name: characterName }),
          });
          if (!res.ok) {
            const errorBody = await res.json();
            throw new Error(errorBody.error || "Failed to join session");
          }
          chat.setShowCharacterModal(false);
        }}
        onCancel={() => chat.setShowCharacterModal(false)}
      />

      {/* Wiki auto-extract toast notifications */}
      <WikiToast toasts={chat.wikiToasts} />

      {/* Narrative State Debug Panel */}
      <NarrativeStatePanel
        sessionId={sessionId}
        sceneState={state.sceneState}
        session={state.session as unknown as Record<string, unknown> | null}
      />
    </div>
  );
}
