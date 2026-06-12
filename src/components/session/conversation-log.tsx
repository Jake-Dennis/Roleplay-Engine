"use client";

/**
 * ConversationLog Component
 *
 * Displays all persona↔NPC conversation pairs from a session as a modal
 * overlay. Groups messages by (persona ↔ NPC) pairs using the speaking_as
 * column, showing collapsible exchange cards with filtering by participant.
 */

import { useState, useEffect, useMemo } from "react";
import { MessageSquare, X, ChevronDown, ChevronUp } from "lucide-react";

interface Exchange {
  speaker: string;
  content: string;
  timestamp?: string;
}

interface ConversationPair {
  personaId: string | null;
  personaName: string | null;
  npcName: string;
  exchanges: Exchange[];
}

interface ConversationLogProps {
  sessionId: string;
  onClose: () => void;
}

interface MessageRow {
  id: string;
  sessionId: string;
  senderId: string | null;
  content: string;
  timestamp: string;
  parentMessageId: string | null;
  speakingAs: string | null;
  senderName: string | null;
  personaName: string | null;
  personaId: string | null;
  [key: string]: unknown;
}

export function ConversationLog({ sessionId, onClose }: ConversationLogProps) {
  const [pairs, setPairs] = useState<ConversationPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadPairs() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/messages?limit=500`
        );
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const messages: MessageRow[] = data.messages || [];

        // Build a lookup by message ID for quick parent resolution
        const messageById = new Map<string, MessageRow>();
        for (const msg of messages) {
          messageById.set(msg.id, msg);
        }

        // Collect user messages that are parents of AI messages
        const aiMessages = messages.filter(
          (m) => m.senderId === null && m.speakingAs
        );

        const pairMap = new Map<string, ConversationPair>();

        for (const aiMsg of aiMessages) {
          const npcName = aiMsg.speakingAs!;
          const parentMsg = aiMsg.parentMessageId
            ? messageById.get(aiMsg.parentMessageId)
            : undefined;

          const userPersonaName = parentMsg?.personaName || parentMsg?.senderName || "Player";
          const userPersonaId = parentMsg?.personaId || parentMsg?.senderId || null;
          const key = `${userPersonaId}||${npcName}`;

          if (!pairMap.has(key)) {
            pairMap.set(key, {
              personaId: userPersonaId,
              personaName: userPersonaName,
              npcName,
              exchanges: [],
            });
          }

          const pair = pairMap.get(key)!;

          // Add user message if we found the parent
          if (parentMsg) {
            // Avoid duplicate consecutive user messages
            const lastExchange = pair.exchanges[pair.exchanges.length - 1];
            if (
              !lastExchange ||
              lastExchange.speaker !== userPersonaName ||
              lastExchange.content !== parentMsg.content
            ) {
              pair.exchanges.push({
                speaker: userPersonaName,
                content: parentMsg.content,
                timestamp: parentMsg.timestamp,
              });
            }
          }

          // Add the NPC response
          pair.exchanges.push({
            speaker: npcName,
            content: aiMsg.content,
            timestamp: aiMsg.timestamp,
          });
        }

        // Sort pairs by most recent exchange
        const sorted = Array.from(pairMap.values());
        sorted.sort((a, b) => {
          const aLast = a.exchanges[a.exchanges.length - 1]?.timestamp || "";
          const bLast = b.exchanges[b.exchanges.length - 1]?.timestamp || "";
          return bLast.localeCompare(aLast);
        });

        // Limit to last 20 exchanges per pair for display
        for (const pair of sorted) {
          pair.exchanges = pair.exchanges.slice(-20);
        }

        setPairs(sorted);
      } catch {
        // Ignore fetch errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPairs();
    return () => { cancelled = true; };
  }, [sessionId]);

  const allNpcs = useMemo(
    () => [...new Set(pairs.map((p) => p.npcName).filter(Boolean))],
    [pairs]
  );

  const allPersonas = useMemo(
    () => [...new Set(pairs.map((p) => p.personaName).filter(Boolean))],
    [pairs]
  );

  const filteredPairs = useMemo(() => {
    if (filter === "all") return pairs;
    return pairs.filter(
      (p) => p.npcName === filter || p.personaName === filter
    );
  }, [pairs, filter]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mx-4 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-border-default bg-bg-elevated shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Conversation Log
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-border-default px-5 py-2.5">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 text-xs text-text-secondary outline-none focus:border-accent"
          >
            <option value="all">All conversations</option>
            {allPersonas.map((name) => (
              <option key={`persona-${name}`} value={name!}>
                {name}
              </option>
            ))}
            {allNpcs.map((name) => (
              <option key={`npc-${name}`} value={name}>
                {name} (NPC)
              </option>
            ))}
          </select>
          <span className="text-xxs text-text-muted">
            {filteredPairs.length} pair{filteredPairs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-text-muted">
              Loading conversations...
            </div>
          ) : filteredPairs.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              No conversations found yet
            </div>
          ) : (
            filteredPairs.map((pair) => {
              const pairKey = `${pair.personaName || "???"}↔${pair.npcName}`;
              const isExpanded = expandedPair === pairKey;

              return (
                <div
                  key={pairKey}
                  className="rounded-lg border border-border-default bg-bg-raised overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedPair(isExpanded ? null : pairKey)
                    }
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-bg-elevated"
                  >
                    <span className="text-xs font-medium text-text-primary">
                      {pair.personaName || "???"} ↔ {pair.npcName}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xxs text-text-muted">
                        {pair.exchanges.length} message
                        {pair.exchanges.length !== 1 ? "s" : ""}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-text-muted" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-default px-4 py-3 space-y-2 max-h-80 overflow-y-auto">
                      {pair.exchanges.map((ex, i) => {
                        const isNpc = ex.speaker === pair.npcName;
                        return (
                          <div key={i} className="text-xs leading-relaxed">
                            <span
                              className={
                                isNpc
                                  ? "font-medium text-accent"
                                  : "font-medium text-text-primary"
                              }
                            >
                              {ex.speaker}:
                            </span>{" "}
                            <span className="text-text-muted">
                              {ex.content}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
