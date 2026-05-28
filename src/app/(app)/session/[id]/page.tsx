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
  Heart,
  Sparkles,
  Lock,
  User,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import type { Intent } from "@/lib/intent-analyzer";
import { useRenderLoop } from "@/hooks/use-render-loop";
import { useSession } from "@/hooks/use-session";
import { useApp } from "@/contexts/app-context";
import { safeParse } from "@/lib/safe-json";
import type { Message } from "@/hooks/use-session";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { WikiToast, type WikiToastItem } from "@/components/ui/wiki-toast";
import { ChatWindow } from "@/components/chat/chat-window";
import { ChatSearch } from "@/components/chat/chat-search";
import { ChatExport } from "@/components/chat/chat-export";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { ParticipantList } from "@/components/session/participant-list";
import { CharacterDeclarationModal } from "@/components/session/character-declaration-modal";
import { SceneStatePanel } from "@/components/session/scene-state-panel";
import { PrivateStatePanel } from "@/components/session/private-state-panel";
import { SessionRecapPanel } from "@/components/session/session-recap-panel";
import { RelationshipTimeline } from "@/components/relationships/relationship-timeline";
import { logger } from "@/lib/logger";
import { NarrativeStatePanel } from "@/components/debug/narrative-state-panel";

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

  // Set session context so sidebar locks to this session's universe
  const { setActiveSession, refreshAll } = useApp();
  useEffect(() => {
    if (session) {
      setActiveSession({
        id: session.id,
        name: session.name,
        type: session.type || "solo",
        group_id: session.group_id || null,
        universe_id: session.universe_id || null,
      });
      refreshAll();
    }
  }, [session, refreshAll, setActiveSession]);

  // Persona state (declared before useEffect that references them)
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const personaDropdownRef = useRef<HTMLDivElement>(null);

  // Wiki auto-extract toast state
  const [wikiToasts, setWikiToasts] = useState<WikiToastItem[]>([]);
  const wikiToastCounterRef = useRef(0);

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
  const [showRelationshipTimeline, setShowRelationshipTimeline] = useState(false);
  const [showRecapPanel, setShowRecapPanel] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [editHistoryMessageId, setEditHistoryMessageId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "leave" | "delete"; id?: string } | null>(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);

  // Load personas
  useEffect(() => {
    queueMicrotask(() => {
      setPersonasLoading(true);
      fetch("/api/personas")
        .then((res) => res.json())
        .then((data) => {
          const list = data.personas || [];
          setPersonas(list);
          // Only set global active persona if session doesn't have its own personaId
          // (session.personaId takes precedence — set by the restore effect below)
          if (!session?.personaId) {
            const active = list.find((p: { isActive: number }) => p.isActive === 1);
            if (active) setActivePersonaId(active.id);
          }
        })
        .catch((err) => logger.warn("persona list load failed", err))
        .finally(() => setPersonasLoading(false));
    });
  }, [session]);

  // Restore session's selected persona on mount
  useEffect(() => {
    queueMicrotask(() => {
      if (session?.personaId) {
        setActivePersonaId(session.personaId);
      }
    });
  }, [session]);

  // Persist persona change to session
  const handlePersonaChange = async (personaId: string | null) => {
    try {
      await fetch(`/api/sessions/${sessionId}/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: personaId }),
      });
      setActivePersonaId(personaId);
    } catch (err: unknown) {
      logger.warn("persona change failed", err);
    }
  };

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

  // Auto-scroll via render loop (30fps, direct DOM — no React re-render)
  const shouldScrollRef = useRef(false);

  useEffect(() => {
    shouldScrollRef.current = true;
  }, [messages, streamContent]);

  useRenderLoop(
    useCallback(() => {
      if (shouldScrollRef.current && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        shouldScrollRef.current = false;
      }
    }, []),
    streaming || !!(messages?.length)
  );

  // -----------------------------------------------------------------------
  // Wiki auto-extract toast notification dispatcher
  // -----------------------------------------------------------------------
  const showWikiToast = useCallback((created: number, updated: number) => {
    const id = ++wikiToastCounterRef.current;
    const toast: WikiToastItem = { id, created, updated, leaving: false };
    setWikiToasts((prev) => [...prev, toast]);

    // Start exit animation at 4.5s
    setTimeout(() => {
      setWikiToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );
    }, 4500);

    // Remove from DOM at 5s
    setTimeout(() => {
      setWikiToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // -----------------------------------------------------------------------
  // SSE EventSource for real-time updates (all sessions)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const evtSource = new EventSource(`/api/sessions/${sessionId}/stream`);

    // Listen for all session events
    const messageEvents = ["message:created", "message:updated", "message:deleted"];
    const groupEvents = ["participant:joined", "participant:left", "participant:kicked", "participant:invited", "participant:role_changed", "turn:updated"];
    // NOTE: generation:started is excluded — it fires when the empty AI placeholder
    // is created, which would cause the UI to show an empty message bubble.
    // The UI already shows streaming content via streamContent state.
    const allEvents = [...messageEvents, ...groupEvents, "session:updated", "generation:done", "scene:updated"];

    const cleanupFns = allEvents.map((eventName) => {
      evtSource.addEventListener(eventName, refreshSession);
      return () => evtSource.removeEventListener(eventName, refreshSession);
    });

    // Wiki auto-extract event listener
    const handleWikiCreated = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const createdArr = data.created as string[] | undefined;
        const updatedArr = data.updated as string[] | undefined;
        const created = createdArr?.length || 0;
        const updated = updatedArr?.length || 0;
        if (created > 0 || updated > 0) {
          showWikiToast(created, updated);
        }
      } catch {
        // Silent
      }
    };

    evtSource.addEventListener("wiki:page_created", handleWikiCreated);

    return () => {
      cleanupFns.forEach((fn) => fn());
      evtSource.removeEventListener("wiki:page_created", handleWikiCreated);
      evtSource.close();
    };
  }, [sessionId, refreshSession, showWikiToast]);

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
      const errorBody = await res.json();
      alert(errorBody.error || "Failed to invite user");
    }
  }

  async function handleKick(participantId: string) {
    await fetch(`/api/sessions/${sessionId}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    });
  }

  async function handleLeave() {
    const res = await fetch(`/api/sessions/${sessionId}/leave`, { method: "POST" });
    if (res.ok) router.push("/session");
    setConfirmAction(null);
  }

  async function handleSetTurnMode(mode: string) {
    await fetch(`/api/sessions/${sessionId}/turn`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnMode: mode }),
    });
  }

  async function handleAdvanceTurn() {
    await advanceTurn();
  }

  async function handleClaimTurn() {
    await claimTurn();
  }

  async function handleRoleChange(participantId: string, role: string) {
    await fetch(`/api/sessions/${sessionId}/participants/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId, role }),
    });
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
          const parsed = safeParse<Record<string, unknown>>(line);
          if (parsed?.chunk) {
            setStreamContent((prev) => prev + parsed.chunk);
          }
          if (parsed?.done) {
            doneReceived = true;
            await refreshSession();
            setStreaming(false);
            setStreamContent("");
          }
          if (parsed?.error) {
            doneReceived = true;
            setGenerationError(parsed.error as string);
            setStreaming(false);
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

    // Add user message with persona
    const msgRes = await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, personaId: activePersonaId }),
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

    setConfirmAction(null);
  }

  // Regenerate - delete message + subsequent, then re-trigger generation
  async function handleRegenerate(messageId: string) {
    const res = await fetch(
      `/api/sessions/${sessionId}/messages/${messageId}/regenerate`,
      { method: "POST" }
    );

    if (!res.ok) return;
    const json = await res.json();

    // Reload and chain generation if there's a user message to regenerate from
    if (json.lastUserMessage) {
      await triggerGeneration(json.lastUserMessage, json.lastUserMessageId);
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
    <div className="flex h-full flex-col">
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
                          onClick={() => { handlePersonaChange(null); setShowPersonaSelector(false); }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            !activePersonaId ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-raised"
                          }`}
                        >
                          No persona (username)
                        </button>
                        {personas.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { handlePersonaChange(p.id); setShowPersonaSelector(false); }}
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
              <button
                onClick={() => setShowRelationshipTimeline(!showRelationshipTimeline)}
                className={`rounded p-1 transition-colors hover:bg-bg-raised ${
                  showRelationshipTimeline ? "text-accent" : "text-text-muted hover:text-accent"
                }`}
                title="Relationship Timeline"
              >
                <Heart className="h-3 w-3" />
              </button>
              <button
                onClick={() => setShowRecapPanel(!showRecapPanel)}
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
              {allMessages.length} message{allMessages.length !== 1 ? "s" : ""}
              {sceneState?.active_location_id &&
                ` · ${sceneState.active_location_id}`}
            </p>
          </div>
        </div>
        <ChatSearch sessionId={sessionId} />
      </div>
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

      {/* Relationship Timeline Panel */}
      {showRelationshipTimeline && (
        <RelationshipTimeline
          sessionId={sessionId}
          sessionUniverseId={session?.universe_id}
          onClose={() => setShowRelationshipTimeline(false)}
        />
      )}

      {/* Session Recap Panel */}
      {showRecapPanel && (
        <SessionRecapPanel
          sessionId={sessionId}
          onClose={() => setShowRecapPanel(false)}
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

      {/* Typing Indicator */}
      {streaming && !streamContent && <TypingIndicator />}

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
            const errorBody = await res.json();
            throw new Error(errorBody.error || "Failed to join session");
          }
          setShowCharacterModal(false);
        }}
        onCancel={() => setShowCharacterModal(false)}
      />

      {/* Wiki auto-extract toast notifications */}
      <WikiToast toasts={wikiToasts} />

      {/* Narrative State Debug Panel */}
      <NarrativeStatePanel
        sessionId={sessionId}
        sceneState={sceneState}
        session={session as unknown as Record<string, unknown> | null}
      />
    </div>
  );
}
