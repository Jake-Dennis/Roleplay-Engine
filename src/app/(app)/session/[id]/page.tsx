"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChatWindow } from "@/components/chat/ChatWindow";

interface Session {
  id: string;
  name: string;
  owner_name: string;
  status: string;
}

interface Message {
  id: string;
  content: string;
  sender_name: string | null;
  sender_id: string | null;
  timestamp: string;
}

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);

  useEffect(() => {
    params.then((p) => setSessionId(p.id));
  }, [params]);

  useEffect(() => {
    if (!sessionId) return;

    // Get current user
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        router.push("/login");
      });

    // Get session data
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Session not found");
        return res.json();
      })
      .then((data) => {
        setSession(data.session);
        setMessages(data.messages || []);
        setLoading(false);
      })
      .catch(() => {
        router.push("/dashboard");
      });
  }, [sessionId, router]);

  if (loading || !sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-text-secondary">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface">
      {/* Header */}
      <header className="bg-surface-elevated border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Back
          </Link>
          <h1 className="text-lg font-semibold text-text-primary">
            {session?.name}
          </h1>
          <span className="text-xs text-text-muted">
            {session?.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">
            {user?.username}
          </span>
        </div>
      </header>

      {/* Chat */}
      <div className="flex-1 min-h-0">
        {sessionId && user && (
          <ChatWindow
            sessionId={sessionId}
            initialMessages={messages}
            userId={user.id}
          />
        )}
      </div>
    </div>
  );
}
