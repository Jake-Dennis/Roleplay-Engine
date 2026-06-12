/**
 * useSessionChat Hook
 *
 * Extracts all session chat page state, effects, and handler functions
 * from the session page into a single hook for cleaner component code.
 *
 * Usage:
 *   const chat = useSessionChat(sessionId, state, refreshSession, claimTurn, advanceTurn);
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { safeParse } from "@/lib/safe-json";
import { useRenderLoop } from "@/hooks/use-render-loop";
import { logger } from "@/lib/logger";
import type { SessionState, Message } from "@/hooks/use-session";
import type { WikiToastItem } from "@/components/ui/wiki-toast";

export interface SessionChatHandlers {
  // Persona
  handlePersonaChange: (personaId: string | null) => Promise<void>;

  // Group actions
  handleInvite: (username: string) => Promise<void>;
  handleKick: (participantId: string) => Promise<void>;
  handleLeave: () => Promise<void>;
  handleSetTurnMode: (mode: string) => Promise<void>;
  handleAdvanceTurn: () => Promise<void>;
  handleClaimTurn: () => Promise<void>;
  handleRoleChange: (participantId: string, role: string) => Promise<void>;

  // Generation
  handleSend: () => Promise<void>;
  handleChoiceSelect: (option: string) => void;
  handleRegenerateChoices: () => Promise<void>;
  triggerGeneration: (userMessage: string, parentMessageId?: string) => Promise<boolean>;

  // Key event
  handleKeyDown: (e: React.KeyboardEvent) => void;

  // Message actions
  handleCopy: (id: string, content: string) => void;
  handleStartEdit: (message: Message) => void;
  handleSaveEdit: (messageId: string) => Promise<void>;
  handleDelete: (messageId: string) => Promise<void>;
  handleRegenerate: (messageId: string) => Promise<void>;
  handleTtsPlay: (messageId: string, content: string) => Promise<void>;

  // Scene
  handleSceneSave: (sceneData: {
    location: string | null;
    goal: string | null;
    tone: string | null;
    activeNpcs: string[] | null;
    activeThreads: string[] | null;
    sceneSummary: string | null;
  }) => Promise<void>;
}

export interface SessionChatState {
  // Persona
  personas: { id: string; name: string }[];
  personasLoading: boolean;
  activePersonaId: string | null;

  // Input
  input: string;

  // Streaming
  streaming: boolean;
  streamContent: string;
  generationError: string | null;
  choices: string[] | null;
  isRegeneratingChoices: boolean;

  // Messages
  editingId: string | null;
  editContent: string;
  copiedId: string | null;
  ttsPlayingId: string | null;
  editHistoryMessageId: string | null;

  // Panels
  showScenePanel: boolean;
  showParticipantPanel: boolean;
  showPrivatePanel: boolean;
  showRelationshipTimeline: boolean;
  showRecapPanel: boolean;

  // Dialogs
  confirmAction: { type: "leave" | "delete"; id?: string } | null;
  showCharacterModal: boolean;

  // Toast
  wikiToasts: WikiToastItem[];

  // Refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;

  // Derived
  isGroup: boolean;
}

export interface SessionChatSetters {
  setActivePersonaId: (id: string | null) => void;
  setInput: (value: string) => void;
  setEditingId: (id: string | null) => void;
  setEditContent: (value: string) => void;
  setShowScenePanel: (show: boolean) => void;
  setShowParticipantPanel: (show: boolean) => void;
  setShowPrivatePanel: (show: boolean) => void;
  setShowRelationshipTimeline: (show: boolean) => void;
  setShowRecapPanel: (show: boolean) => void;
  setConfirmAction: (action: { type: "leave" | "delete"; id?: string } | null) => void;
  setShowCharacterModal: (show: boolean) => void;
  setEditHistoryMessageId: (id: string | null) => void;
  setGenerationError: (error: string | null) => void;
}

export type UseSessionChatResult = SessionChatState & SessionChatHandlers & SessionChatSetters;

export function useSessionChat(
  sessionId: string,
  state: SessionState,
  refreshSession: () => Promise<void>,
  claimTurn: () => Promise<boolean>,
  advanceTurn: () => Promise<boolean>
): UseSessionChatResult {
  const router = useRouter();

  // ---- Persona state ----
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);

  // ---- Wiki auto-extract toast state ----
  const [wikiToasts, setWikiToasts] = useState<WikiToastItem[]>([]);
  const wikiToastCounterRef = useRef(0);

  // ---- Input & streaming ----
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const [defaultVoice, setDefaultVoice] = useState("af_heart");
  const [autoTtsSettings, setAutoTtsSettings] = useState({ narrator: false, yourPersona: false, otherPersonas: false });
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[] | null>(null);
  const [isRegeneratingChoices, setIsRegeneratingChoices] = useState(false);

  // ---- Panel visibility toggles ----
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

  // ---- Misc state ----
  const [editHistoryMessageId, setEditHistoryMessageId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "leave" | "delete"; id?: string } | null>(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsBlobUrlRef = useRef<string | null>(null);
  const streamAccumulator = useRef("");
  const lastFlushTime = useRef(0);
  const shouldScrollRef = useRef(false);
  const handleTtsPlayRef = useRef<(messageId: string, content: string) => Promise<void>>(async () => {});
  const activePersonaIdRef = useRef<string | null>(null);
  const autoTtsSettingsRef = useRef(autoTtsSettings);

  // Keep refs in sync with state so SSE callbacks (which close over refs) always see latest values
  autoTtsSettingsRef.current = autoTtsSettings;
  activePersonaIdRef.current = activePersonaId;

  // ---- Derived ----
  const isGroup = state.session?.type === "group";

  // ======================================================================
  // Effects
  // ======================================================================

  // Load personas
  useEffect(() => {
    queueMicrotask(() => {
      setPersonasLoading(true);
      fetch("/api/personas")
        .then((res) => res.json())
        .then((data) => {
          const list = data.personas || [];
          setPersonas(list);
          if (!state.session?.personaId) {
            const active = list.find((p: { isActive: number }) => p.isActive === 1);
            if (active) setActivePersonaId(active.id);
          }
        })
        .catch((err) => logger.warn("persona list load failed", err))
        .finally(() => setPersonasLoading(false));
    });
  }, [state.session]);

  // Restore session's selected persona on mount
  useEffect(() => {
    queueMicrotask(() => {
      if (state.session?.personaId) {
        setActivePersonaId(state.session.personaId);
      }
    });
  }, [state.session]);

  // Load narrator voice assignment for TTS default
  useEffect(() => {
    fetch("/api/voice-assignments?entityType=narrator&entityId=default")
      .then((res) => res.json())
      .then((data) => {
        if (data.assignment?.voice_name) {
          setDefaultVoice(data.assignment.voice_name);
        }
      })
      .catch(() => { /* use fallback default */ });
  }, []);

  // Auto-TTS settings
  useEffect(() => {
    fetch("/api/user/settings")
      .then(r => r.json())
      .then(d => {
        if (d.settings) {
          setAutoTtsSettings({
            narrator: d.settings.autoTtsNarrator ?? false,
            yourPersona: d.settings.autoTtsYourPersona ?? false,
            otherPersonas: d.settings.autoTtsOtherPersonas ?? false,
          });
        }
      })
      .catch(() => {});
  }, []);

  // TTS cleanup on unmount
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

  // Auto-scroll via render loop
  useEffect(() => {
    shouldScrollRef.current = true;
  }, [state.messages, streamContent]);

  useRenderLoop(
    useCallback(() => {
      if (shouldScrollRef.current && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        shouldScrollRef.current = false;
      }
    }, []),
    streaming || !!(state.messages?.length)
  );

  // Wiki toast notification dispatcher
  const showWikiToast = useCallback((created: number, updated: number) => {
    const id = ++wikiToastCounterRef.current;
    const toast: WikiToastItem = { id, created, updated, leaving: false };
    setWikiToasts((prev) => [...prev, toast]);

    setTimeout(() => {
      setWikiToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );
    }, 4500);

    setTimeout(() => {
      setWikiToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // SSE EventSource for real-time updates
  useEffect(() => {
    const evtSource = new EventSource(`/api/sessions/${sessionId}/stream`);

    const messageEvents = ["message:created", "message:updated", "message:deleted"];
    const groupEvents = ["participant:joined", "participant:left", "participant:kicked", "participant:invited", "participant:role_changed", "turn:updated"];
    const allEvents = [...messageEvents, ...groupEvents, "session:updated", "generation:done", "scene:updated"];
    const cleanupFns = allEvents.map((eventName) => {
      evtSource.addEventListener(eventName, refreshSession);
      return () => evtSource.removeEventListener(eventName, refreshSession);
    });

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

    // Handle async choices generated by background job
    const handleChoicesEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.options && Array.isArray(data.options)) {
          setChoices(data.options as string[]);
        }
      } catch {
        // Silent
      }
    };

    evtSource.addEventListener("session:choices", handleChoicesEvent);

    // Auto-play TTS on new messages
    const handleMessageCreated = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        const msgId = msg.id || msg.messageId;
        if (!msgId || !msg.content) return;

        // Determine message type
        const isNarrator = msg.senderId === null || msg.senderId === undefined;
        const isYourPersona = !isNarrator && msg.personaName && activePersonaIdRef.current && msg.personaId === activePersonaIdRef.current;
        const isOtherPersona = !isNarrator && msg.personaName && !isYourPersona;

        let shouldPlay = false;
        if (isNarrator && autoTtsSettingsRef.current.narrator) shouldPlay = true;
        else if (isYourPersona && autoTtsSettingsRef.current.yourPersona) shouldPlay = true;
        else if (isOtherPersona && autoTtsSettingsRef.current.otherPersonas) shouldPlay = true;

        if (shouldPlay) {
          // Small delay to let the message render
          setTimeout(() => {
            handleTtsPlayRef.current(msgId as string, msg.content as string);
          }, 500);
        }
      } catch {
        // Ignore parse errors
      }
    };

    evtSource.addEventListener("message:created", handleMessageCreated);

    return () => {
      cleanupFns.forEach((fn) => fn());
      evtSource.removeEventListener("wiki:page_created", handleWikiCreated);
      evtSource.removeEventListener("session:choices", handleChoicesEvent);
      evtSource.removeEventListener("message:created", handleMessageCreated);
      evtSource.close();
    };
  }, [sessionId, refreshSession, showWikiToast, setChoices]);

  // ======================================================================
  // Handlers
  // ======================================================================

  // Persona change
  const handlePersonaChange = useCallback(async (personaId: string | null) => {
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
  }, [sessionId]);

  // ---- Group session actions ----

  const handleInvite = useCallback(async (username: string) => {
    if (!username.trim()) return;
    const res = await fetch(`/api/sessions/${sessionId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    if (!res.ok) {
      const errorBody = await res.json();
      alert(errorBody.error || "Failed to invite user");
    }
  }, [sessionId]);

  const handleKick = useCallback(async (participantId: string) => {
    await fetch(`/api/sessions/${sessionId}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    });
  }, [sessionId]);

  const handleLeave = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/leave`, { method: "POST" });
    if (res.ok) router.push("/session");
    setConfirmAction(null);
  }, [sessionId, router]);

  const handleSetTurnMode = useCallback(async (mode: string) => {
    await fetch(`/api/sessions/${sessionId}/turn`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnMode: mode }),
    });
  }, [sessionId]);

  const handleAdvanceTurn = useCallback(async () => {
    await advanceTurn();
  }, [advanceTurn]);

  const handleClaimTurn = useCallback(async () => {
    await claimTurn();
  }, [claimTurn]);

  const handleRoleChange = useCallback(async (participantId: string, role: string) => {
    await fetch(`/api/sessions/${sessionId}/participants/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId, role }),
    });
  }, [sessionId]);

  // ---- Generation ----

  const triggerGeneration = useCallback(async (userMessage: string, parentMessageId?: string): Promise<boolean> => {
    await refreshSession();

    setStreaming(true);
    setStreamContent("");
    streamAccumulator.current = "";
    lastFlushTime.current = 0;
    setGenerationError(null);
    setChoices(null);

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
            streamAccumulator.current += parsed.chunk as string;
            const now = Date.now();
            if (now - lastFlushTime.current > 100) {
              setStreamContent(streamAccumulator.current);
              lastFlushTime.current = now;
            }
          }
          if (parsed?.done) {
            doneReceived = true;
            setStreamContent(streamAccumulator.current);
            streamAccumulator.current = "";
            await refreshSession();
            setStreaming(false);
            setStreamContent("");
          }
          if (parsed?.error) {
            doneReceived = true;
            streamAccumulator.current = "";
            setGenerationError(parsed.error as string);
            setStreaming(false);
          }
        }
      }

      if (!doneReceived) {
        setStreamContent(streamAccumulator.current);
        streamAccumulator.current = "";
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
  }, [sessionId, refreshSession]);

  // Send a new message
  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || streaming) return;

    setInput("");

    const msgRes = await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, personaId: activePersonaId }),
    });

    if (!msgRes.ok) return;

    await triggerGeneration(content);
  }, [input, streaming, sessionId, activePersonaId, triggerGeneration]);

  // Select a narrative choice
  const handleChoiceSelect = useCallback((option: string) => {
    setInput(option);
    setChoices(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  // Regenerate branching narrative choices
  const handleRegenerateChoices = useCallback(async () => {
    setIsRegeneratingChoices(true);
    try {
      const res = await fetch(`/api/generate/${sessionId}/regenerate-choices`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
          setChoices(data.choices);
        }
      }
    } catch {
      // Silent
    } finally {
      setIsRegeneratingChoices(false);
    }
  }, [sessionId]);

  // Key press handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ---- Message actions ----

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleStartEdit = useCallback((message: Message) => {
    setEditingId(message.id);
    setEditContent(message.content);
  }, []);

  const handleSaveEdit = useCallback(async (messageId: string) => {
    if (!editContent.trim()) return;

    const res = await fetch(`/api/sessions/${sessionId}/messages/${messageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent.trim(), regenerate: true }),
    });

    if (!res.ok) return;

    const data = await res.json();
    const newMessageId = data.message?.id || data.newMessage?.id || messageId;

    setEditingId(null);
    setEditContent("");

    await triggerGeneration(editContent.trim(), newMessageId);
  }, [editContent, sessionId, triggerGeneration]);

  const handleDelete = useCallback(async (messageId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/messages/${messageId}`, {
      method: "DELETE",
    });

    if (!res.ok) return;
    setConfirmAction(null);
  }, [sessionId]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    const res = await fetch(
      `/api/sessions/${sessionId}/messages/${messageId}/regenerate`,
      { method: "POST" }
    );

    if (!res.ok) return;
    const json = await res.json();

    if (json.lastUserMessage) {
      await triggerGeneration(json.lastUserMessage, json.lastUserMessageId);
    }
  }, [sessionId, triggerGeneration]);

  // TTS playback
  const handleTtsPlay = useCallback(async (messageId: string, content: string) => {
    if (ttsPlayingId === messageId) {
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
      const streamRes = await fetch(`/api/tts/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, voice: defaultVoice }),
      });

      if (streamRes.ok && streamRes.body) {
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
        body: JSON.stringify({ text: content, voice: defaultVoice }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

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
  }, [defaultVoice, ttsPlayingId]);

  // Keep handleTtsPlayRef in sync with latest callback
  handleTtsPlayRef.current = handleTtsPlay;

  // Scene state update
  const handleSceneSave = useCallback(async (sceneData: {
    location: string | null;
    goal: string | null;
    tone: string | null;
    activeNpcs: string[] | null;
    activeThreads: string[] | null;
    sceneSummary: string | null;
  }) => {
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
  }, [sessionId, refreshSession]);

  // ======================================================================
  // Return aggregated result
  // ======================================================================

  return {
    // State
    personas,
    personasLoading,
    activePersonaId,
    input,
    streaming,
    streamContent,
    editingId,
    editContent,
    copiedId,
    ttsPlayingId,
    generationError,
    choices,
    isRegeneratingChoices,
    showScenePanel,
    showParticipantPanel,
    showPrivatePanel,
    showRelationshipTimeline,
    showRecapPanel,
    editHistoryMessageId,
    confirmAction,
    showCharacterModal,
    wikiToasts,
    messagesEndRef,
    inputRef,
    isGroup,

    // Handlers
    handlePersonaChange,
    handleInvite,
    handleKick,
    handleLeave,
    handleSetTurnMode,
    handleAdvanceTurn,
    handleClaimTurn,
    handleRoleChange,
    handleSend,
    handleChoiceSelect,
    handleRegenerateChoices,
    triggerGeneration,
    handleKeyDown,
    handleCopy,
    handleStartEdit,
    handleSaveEdit,
    handleDelete,
    handleRegenerate,
    handleTtsPlay,
    handleSceneSave,

    // Setters
    setActivePersonaId,
    setInput,
    setEditingId,
    setEditContent,
    setShowScenePanel,
    setShowParticipantPanel,
    setShowPrivatePanel,
    setShowRelationshipTimeline,
    setShowRecapPanel,
    setConfirmAction,
    setShowCharacterModal,
    setEditHistoryMessageId,
    setGenerationError,
  };
}
