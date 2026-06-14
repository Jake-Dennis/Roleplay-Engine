"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

interface Exchange {
  speaker: string;
  content: string;
}

interface ConversationPair {
  personaId: string | null;
  personaName: string | null;
  npcName: string;
  exchanges: Exchange[];
}

export default function ConversationsPage({ params }: { params: Promise<{ id: string }> }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [pairs, setPairs] = useState<ConversationPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    params.then(p => setSessionId(p.id));
  }, [params]);

  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/sessions/${sessionId}/messages?limit=500`)
      .then(r => r.json())
      .then(data => {
        const messages = data.messages || [];
        const pairMap = new Map<string, ConversationPair>();

        for (const msg of messages) {
          if (msg.senderId !== null || !msg.speakingAs) continue;
          const npcName = msg.speakingAs;
          const key = npcName;

          if (!pairMap.has(key)) {
            pairMap.set(key, {
              personaId: null,
              personaName: null,
              npcName,
              exchanges: [],
            });
          }
          const pair = pairMap.get(key)!;

          const userMsg = messages.find((m: any) =>
            m.id === msg.parentMessageId ||
            (m.senderId !== null && m.timestamp < msg.timestamp &&
             Math.abs(new Date(msg.timestamp).getTime() - new Date(m.timestamp).getTime()) < 60000)
          );

          if (userMsg) {
            const speakerName = userMsg.personaName || userMsg.senderName || "Player";
            if (!pair.personaName) pair.personaName = speakerName;
            pair.exchanges.push({
              speaker: speakerName,
              content: userMsg.content,
            });
          }
          pair.exchanges.push({
            speaker: npcName,
            content: msg.content,
          });
        }

        for (const pair of pairMap.values()) {
          pair.exchanges = pair.exchanges.slice(-20);
        }

        setPairs(Array.from(pairMap.values()));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const filteredPairs = filter === "all"
    ? pairs
    : pairs.filter(p => p.npcName === filter || p.personaName === filter);

  const allNpcs = [...new Set(pairs.map(p => p.npcName).filter(Boolean))];
  const allPersonas = [...new Set(pairs.map(p => p.personaName).filter(Boolean))];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/session/${sessionId}`}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-text-accent" />
            <h1 className="text-base font-semibold text-text-primary">Conversation Log</h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            All persona ↔ NPC conversations from this session
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary"
        >
          <option value="all">All conversations</option>
          {allPersonas.map(name => (
            <option key={name} value={name!}>{name}</option>
          ))}
          {allNpcs.map(name => (
            <option key={name} value={name}>{name} (NPC)</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-text-muted">Loading conversations...</div>
      ) : filteredPairs.length === 0 ? (
        <div className="py-12 text-center text-xs text-text-muted">
          No conversations found yet. Start roleplaying to see persona ↔ NPC exchanges.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPairs.map((pair) => {
            const pairKey = `${pair.personaName}↔${pair.npcName}`;
            const isExpanded = expandedPair === pairKey;

            return (
              <div key={pairKey} className="rounded-xl border border-border-default bg-bg-elevated overflow-hidden">
                <button
                  onClick={() => setExpandedPair(isExpanded ? null : pairKey)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-bg-raised transition-colors"
                >
                  <span className="text-sm font-medium text-text-primary">
                    {pair.personaName || "???"} ↔ {pair.npcName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xxs text-text-muted">{pair.exchanges.length} messages</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border-default px-5 py-4 space-y-3 max-h-96 overflow-y-auto">
                    {pair.exchanges.map((ex, i) => (
                      <div key={i} className="text-sm">
                        <span className={`font-medium ${ex.speaker === pair.npcName ? 'text-accent' : 'text-text-primary'}`}>
                          {ex.speaker}:
                        </span>
                        <span className="text-text-muted ml-1">{ex.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
