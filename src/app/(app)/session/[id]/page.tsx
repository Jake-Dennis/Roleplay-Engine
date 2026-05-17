"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Compass,
  Swords,
  MessageCircle,
  Search,
  Moon,
  Footprints,
  Wand2,
  Users,
  UserPlus,
  UserMinus,
  Footprints as TurnIcon,
  GitBranch,
  Sparkles,
  Lock,
} from "lucide-react";

import { classifyIntent, type Intent } from "@/lib/intent-analyzer";
import { useRenderLoop } from "@/hooks/use-render-loop";
import { useSession } from "@/hooks/use-session";
import type { Message } from "@/hooks/use-session";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ChatWindow } from "@/components/chat/chat-window";
import { ParticipantList } from "@/components/session/participant-list";
import { CharacterDeclarationModal } from "@/components/session/character-declaration-modal";
import { SceneStatePanel } from "@/components/session/scene-state-panel";
import { PrivateStatePanel } from "@/components/session/private-state-panel";

export default function SessionChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  // H2: Use useSession hook for session state management
  const {
    session,
    messages,
    sceneState,
    participants,
    turnConfig,
    isOwner,
    isObserver,
    loading,
    error,
    refresh: refreshSession,
    claimTurn,
    advanceTurn,
  } = useSession(sessionId);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showScenePanel, setShowScenePanel] = useState(false);
  const [showParticipantPanel, setShowParticipantPanel] = useState(false);
  const [showPrivatePanel, setShowPrivatePanel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("private-panel-open") === "true";
    }
    return false;
  });
  const [inviteUsername, setInviteUsername] = useState("");
  const [editHistoryMessageId, setEditHistoryMessageId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "leave" | "delete"; id?: string } | null>(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [joinError, setJoinError] = useState("");

  const isGroup = session?.type === "group";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsBlobUrlRef = useRef<string | null>(null);

  // M7: Cleanup TTS audio on unmount
  useEffect(() => {
    return () => {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current);
        ttsBlobUrlRef.current = null;
      }
    };
  }, []);

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-scroll via render loop (30fps, direct DOM — no React re-render)
  const shouldScrollRef = useRef(false);

  useEffect(() => {
    shouldScrollRef.current = true;
  }, [messages, streamContent]);

  useRenderLoop(
    useCallback(() => {
      if (shouldScrollRef.current && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "auto" });
        shouldScrollRef.current = false;
      }
    }, []),
    streaming || !!(messages?.length)
  );

  // -----------------------------------------------------------------------
  // SSE EventSource for real-time updates (all sessions)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const evtSource = new EventSource(`/api/sessions/${sessionId}/stream`);

    // Listen for all session events
    const messageEvents = ["message:created", "message:updated", "message:deleted"];
    const groupEvents = ["participant:joined", "participant:left", "participant:kicked", "participant:invited", "turn:updated"];
    // NOTE: generation:started is excluded — it fires when the empty AI placeholder
    // is created, which would cause the UI to show an empty message bubble.
    // The UI already shows streaming content via streamContent state.
    const allEvents = [...messageEvents, ...groupEvents, "session:updated", "generation:done"];

    const cleanupFns = allEvents.map((eventName) => {
      evtSource.addEventListener(eventName, refreshSession);
      return () => evtSource.removeEventListener(eventName, refreshSession);
    });

    return () => {
      cleanupFns.forEach((fn) => fn());
      evtSource.close();
    };
  }, [sessionId, refreshSession]);

  // -----------------------------------------------------------------------
  // Group session actions
  // -----------------------------------------------------------------------
  async function handleInvite() {
    if (!inviteUsername.trim()) return;
    const res = await fetch(`/api/sessions/${sessionId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: inviteUsername.trim() }),
    });
    if (res.ok) {
      setInviteUsername("");
    } else {
      const err = await res.json();
      alert(err.error || "Failed to invite user");
    }
  }

  async function handleKick(participantId: string) {
    const res = await fetch(`/api/sessions/${sessionId}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    });
    if (res.ok) {
      await refreshSession();
    }
  }

  async function handleLeave() {
    const res = await fetch(`/api/sessions/${sessionId}/leave`, { method: "POST" });
    if (res.ok) router.push("/session");
    setConfirmAction(null);
  }

  async function handleSetTurnMode(mode: string) {
    const res = await fetch(`/api/sessions/${sessionId}/turn`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnMode: mode }),
    });
    if (res.ok) {
      await refreshSession();
    }
  }

  async function handleAdvanceTurn() {
    await advanceTurn();
  }

  async function handleClaimTurn() {
    await claimTurn();
  }

  async function handleRoleChange(participantId: string, role: string) {
    const res = await fetch(`/api/sessions/${sessionId}/participants/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId, role }),
    });
    if (res.ok) {
      await refreshSession();
    }
  }

  // -----------------------------------------------------------------------
  // Trigger AI generation via SSE
  // -----------------------------------------------------------------------
  async function triggerGeneration(userMessage: string, parentMessageId?: string): Promise<boolean> {
    // Refresh messages first to have latest context
    await refreshSession();

    setStreaming(true);
    setStreamContent("");
    setGenerationError(null);

    let doneReceived = false;

    try {
      const genRes = await fetch(`/api/generate/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, parentMessageId }),
      });

      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        setGenerationError(errData.error || "Generation failed");
        setStreaming(false);
        return false;
      }

      const reader = genRes.body?.getReader();
      if (!reader) {
        setGenerationError("Stream not available");
        setStreaming(false);
        return false;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.chunk) {
              setStreamContent((prev) => prev + parsed.chunk);
            }
            if (parsed.done) {
              doneReceived = true;
              await refreshSession();
              setStreaming(false);
              setStreamContent("");
            }
            if (parsed.error) {
              doneReceived = true;
              setGenerationError(parsed.error);
              setStreaming(false);
            }
          } catch {
            // skip incomplete lines
          }
        }
      }

      if (!doneReceived) {
        await refreshSession();
        setStreaming(false);
        setStreamContent("");
      }

      return true;
    } catch {
      setGenerationError("Connection to Ollama failed");
      setStreaming(false);
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Send a new message
  // -----------------------------------------------------------------------
  async function handleSend() {
    const content = input.trim();
    if (!content || streaming) return;

    setInput("");

    // Add user message
    const msgRes = await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!msgRes.ok) return;

    await triggerGeneration(content);
  }

  // Handle key press
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // -----------------------------------------------------------------------
  // Message actions
  // -----------------------------------------------------------------------

  // Copy
  function handleCopy(id: string, content: string) {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Start editing
  function handleStartEdit(message: Message) {
    setEditingId(message.id);
    setEditContent(message.content);
  }

  // Save edit - chain with generation
  async function handleSaveEdit(messageId: string) {
    if (!editContent.trim()) return;

    const res = await fetch(`/api/sessions/${sessionId}/messages/${messageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent.trim(), regenerate: true }),
    });

    if (!res.ok) return;

    setEditingId(null);
    setEditContent("");

    // Chain: trigger generation with the edited content, branching from the edited message
    await triggerGeneration(editContent.trim(), messageId);
  }

  // Delete
  async function handleDelete(messageId: string) {
    const res = await fetch(`/api/sessions/${sessionId}/messages/${messageId}`, {
      method: "DELETE",
    });

    if (!res.ok) return;

    await refreshSession();
    setConfirmAction(null);
  }

  // Regenerate - delete message + subsequent, then re-trigger generation
  async function handleRegenerate(messageId: string) {
    const res = await fetch(
      `/api/sessions/${sessionId}/messages/${messageId}/regenerate`,
      { method: "POST" }
    );

    if (!res.ok) return;
    const data = await res.json();

    // Reload and chain generation if there's a user message to regenerate from
    if (data.lastUserMessage) {
      await triggerGeneration(data.lastUserMessage, data.lastUserMessageId);
    } else {
      // Just reload if no user message found
      await refreshSession();
    }
  }

  // TTS playback - uses streaming when available, falls back to non-streaming
  async function handleTtsPlay(messageId: string, content: string) {
    if (ttsPlayingId === messageId) {
      // Stop
      ttsAudioRef.current?.pause();
      ttsAudioRef.current = null;
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current);
        ttsBlobUrlRef.current = null;
      }
      setTtsPlayingId(null);
      return;
    }

    try {
      // Try streaming first
      const streamRes = await fetch(`/api/tts/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, voice: "af_bella" }),
      });

      if (streamRes.ok && streamRes.body) {
        // Streaming response - use MediaSource for chunked playback
        const mediaSource = new MediaSource();
        const audio = new Audio();

        ttsAudioRef.current = audio;

        mediaSource.addEventListener("sourceopen", async () => {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          const reader = streamRes.body!.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              while (sourceBuffer.updating) {
                await new Promise((r) => setTimeout(r, 10));
              }
              sourceBuffer.appendBuffer(value);
            }
            mediaSource.endOfStream();
          } catch {
            // Stream error
          }
        });

        audio.src = URL.createObjectURL(mediaSource);
        setTtsPlayingId(messageId);

        audio.onended = () => {
          setTtsPlayingId(null);
        };

        audio.onerror = () => {
          setTtsPlayingId(null);
        };

        await audio.play();
        return;
      }

      // Fallback to non-streaming
      const res = await fetch(`/api/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, voice: "af_bella" }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Clean up previous audio
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current);
      }

      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      ttsBlobUrlRef.current = url;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        ttsBlobUrlRef.current = null;
        setTtsPlayingId(null);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        ttsBlobUrlRef.current = null;
        setTtsPlayingId(null);
      };

      setTtsPlayingId(messageId);
      await audio.play();
    } catch {
      setTtsPlayingId(null);
    }
  }

  // -----------------------------------------------------------------------
  // Scene state update
  // -----------------------------------------------------------------------
  async function handleSceneSave(sceneData: {
    location: string | null;
    goal: string | null;
    tone: string | null;
    activeNpcs: string[] | null;
    activeThreads: string[] | null;
    sceneSummary: string | null;
  }) {
    await fetch(`/api/sessions/${sessionId}/scene`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: sceneData.location,
        goal: sceneData.goal,
        tone: sceneData.tone,
        activeNpcs: sceneData.activeNpcs,
        activeThreads: sceneData.activeThreads,
        sceneSummary: sceneData.sceneSummary,
      }),
    });

    await refreshSession();
    setShowScenePanel(false);
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading session...</span>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-20 text-text-muted text-xs">Session not found</div>
    );
  }

  const allMessages = messages || [];

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default pb-3">
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
                {session.name}
              </h1>
              {sceneState && (
                <button
                  onClick={() => setShowScenePanel(!showScenePanel)}
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-accent"
                  title="Scene State"
                >
                  <MapPin className="h-3 w-3" />
                </button>
              )}
              {isGroup && (
                <button
                  onClick={() => setShowParticipantPanel(!showParticipantPanel)}
                  className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                    showParticipantPanel ? "text-accent" : "text-text-muted hover:text-accent"
                  }`}
                  title="Participants"
                >
                  <Users className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => setShowPrivatePanel(!showPrivatePanel)}
                className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                  showPrivatePanel ? "text-accent" : "text-text-muted hover:text-accent"
                }`}
                title="Private State"
              >
                <Lock className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xxs text-text-muted">
              {allMessages.length} message{allMessages.length !== 1 ? "s" : ""}
              {sceneState?.active_location_id &&
                ` · ${sceneState.active_location_id}`}
            </p>
          </div>
        </div>
      </div>

      {/* Scene State Panel */}
      {showScenePanel && (
        <SceneStatePanel
          scene={sceneState}
          onSave={(data) => handleSceneSave(data)}
          onClose={() => setShowScenePanel(false)}
        />
      )}

      {/* Participant Panel (group sessions) */}
      {showParticipantPanel && isGroup && (
        <ParticipantList
          participants={participants}
          isOwner={isOwner}
          turnConfig={turnConfig}
          onInvite={handleInvite}
          onKick={handleKick}
          onLeave={() => setConfirmAction({ type: "leave" })}
          onSetTurnMode={handleSetTurnMode}
          onAdvanceTurn={handleAdvanceTurn}
          onClaimTurn={handleClaimTurn}
          onRoleChange={handleRoleChange}
          onClose={() => setShowParticipantPanel(false)}
        />
      )}

      {/* Private State Panel */}
      {showPrivatePanel && (
        <PrivateStatePanel
          sessionId={sessionId}
          onClose={() => setShowPrivatePanel(false)}
        />
      )}

      {/* Generation Error Banner */}
      {generationError && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2">
          <span className="flex-1 text-xs text-error">{generationError}</span>
          <button
            onClick={() => setGenerationError(null)}
            className="rounded p-1 text-error/70 transition-colors hover:text-error hover:bg-error/10"
          >
            ✕
          </button>
        </div>
      )}

      {/* Chat Window */}
      <ChatWindow
        messages={allMessages}
        isStreaming={streaming}
        streamingContent={streamContent}
        input={input}
        editingId={editingId}
        editContent={editContent}
        copiedId={copiedId}
        ttsPlayingId={ttsPlayingId}
        intentIcons={intentIcons}
        onCopy={handleCopy}
        onStartEdit={handleStartEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={() => setEditingId(null)}
        onDelete={(id) => setConfirmAction({ type: "delete", id })}
        onRegenerate={handleRegenerate}
        onTtsPlay={handleTtsPlay}
        onEditContentChange={setEditContent}
        onShowEditHistory={setEditHistoryMessageId}
        onSend={handleSend}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        scrollRef={messagesEndRef}
        inputRef={inputRef}
        sessionId={sessionId}
        editHistoryMessageId={editHistoryMessageId}
        onEditHistoryClose={() => setEditHistoryMessageId(null)}
        disabled={isObserver}
      />

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={confirmAction?.type === "leave"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleLeave}
        title="Leave Session"
        message="Are you sure you want to leave this session?"
        confirmVariant="danger"
      />
      <ConfirmationDialog
        open={confirmAction?.type === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.id && handleDelete(confirmAction.id)}
        title="Delete Message"
        message="Delete this message and all subsequent messages? This cannot be undone."
        confirmVariant="danger"
      />

      {/* Character Declaration Modal */}
      <CharacterDeclarationModal
        open={showCharacterModal}
        sessionId={sessionId}
        takenCharacters={participants
          .filter((p) => p.character_name)
          .map((p) => p.character_name!)}
        onJoin={async (characterName) => {
          const res = await fetch(`/api/sessions/${sessionId}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ character_name: characterName }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to join session");
          }
          setShowCharacterModal(false);
          await refreshSession();
        }}
        onCancel={() => setShowCharacterModal(false)}
      />
    </div>
  );
}
