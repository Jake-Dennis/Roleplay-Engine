"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MessageSquare, ChevronDown, ChevronUp, ArrowRight, MessageCircle } from "lucide-react";
import { useApp } from "@/contexts/app-context";

interface Exchange {
  speaker: string;
  content: string;
}

interface ConversationPair {
  personaName: string | null;
  npcName: string;
  exchanges: Exchange[];
}

interface SessionConv {
  sessionId: string;
  sessionName: string;
  pairs: ConversationPair[];
}

export default function ConversationsPage() {
  const { activeSession } = useApp();
  const filterSessionId = activeSession?.id || null;

  const [sessionConvs, setSessionConvs] = useState<SessionConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);

  useEffect(() => {
    // Fetch all sessions to find ones with conversations
    const fetchAll = async () => {
      try {
        const sessionsRes = await fetch("/api/sessions?scope=personal");
        const sessionsData = await sessionsRes.json();
        const sessions: { id: string; name: string }[] = sessionsData.sessions || [];

        // Filter by sessionId if provided
        const targetSessions = filterSessionId
          ? sessions.filter(s => s.id === filterSessionId)
          : sessions;

        const results: SessionConv[] = [];

        for (const session of targetSessions) {
          const msgRes = await fetch(`/api/sessions/${session.id}/messages?limit=10000`);
          if (!msgRes.ok) continue;
          const msgData = await msgRes.json();
          const messages = msgData.messages || [];
          const pairMap = new Map<string, ConversationPair>();

          for (const msg of messages) {
            if (msg.senderId !== null || !msg.speakingAs) continue;
            const npcName = msg.speakingAs;
            const key = npcName;

            if (!pairMap.has(key)) {
              pairMap.set(key, { personaName: null, npcName, exchanges: [] });
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
              pair.exchanges.push({ speaker: speakerName, content: userMsg.content });
            }
            pair.exchanges.push({ speaker: npcName, content: msg.content });
          }

          for (const pair of pairMap.values()) {
            pair.exchanges = pair.exchanges.slice(-20);
          }

          if (pairMap.size > 0) {
            results.push({ sessionId: session.id, sessionName: session.name, pairs: Array.from(pairMap.values()) });
          }
        }

        setSessionConvs(results);
      } catch { /* ignore */ }
      setLoading(false);
    };

    fetchAll();
  }, [filterSessionId]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-base font-semibold text-text-primary">Conversations</h1>
        <p className="text-xs text-text-muted mt-1">Persona ↔ NPC exchanges across all sessions</p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-text-muted">Loading conversations...</div>
      ) : sessionConvs.length === 0 ? (
        <div className="py-12 text-center text-xs text-text-muted">
          No conversations found yet. Roleplay with NPCs to see conversations here.
        </div>
      ) : (
        <div className="space-y-6">
          {sessionConvs.map((sc) => (
            <div key={sc.sessionId} className="space-y-3">
              <Link
                href={`/session/${sc.sessionId}`}
                className="flex items-center gap-2 text-sm font-medium text-text-primary hover:text-accent transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-text-accent" />
                {sc.sessionName}
                <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
              </Link>

              <div className="space-y-2 pl-6">
                {sc.pairs.map((pair) => {
                  const pairKey = `${sc.sessionId}::${pair.personaName}↔${pair.npcName}`;
                  const isExpanded = expandedPair === pairKey;

                  return (
                    <div key={pairKey} className="rounded-lg border border-border-default bg-bg-elevated overflow-hidden">
                      <button
                        onClick={() => setExpandedPair(isExpanded ? null : pairKey)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-bg-raised transition-colors"
                      >
                        <span className="text-xs font-medium text-text-primary">
                          {pair.personaName || "???"} ↔ {pair.npcName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xxs text-text-muted">{pair.exchanges.length} msgs</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-text-muted" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border-default px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
                          {pair.exchanges.map((ex, i) => (
                            <div key={i} className="text-xs">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
