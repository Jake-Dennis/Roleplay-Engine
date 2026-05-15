"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  created_at: string;
}

interface Session {
  id: string;
  name: string;
  owner_name: string;
  status: string;
  updated_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSessionName, setNewSessionName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      }),
      fetch("/api/sessions").then((res) => {
        if (!res.ok) throw new Error("Failed to load sessions");
        return res.json();
      }),
    ])
      .then(([userData, sessionData]) => {
        setUser(userData.user);
        setSessions(sessionData.sessions || []);
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newSessionName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSessionName.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/session/${data.session.id}`);
      }
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-surface-elevated border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">
          Roleplay Engine
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-text-secondary text-sm">
            {user?.username}
          </span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Create Session */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-text-primary mb-3">
            New Session
          </h2>
          <form onSubmit={handleCreateSession} className="flex gap-2">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Session name..."
              className="flex-1 px-3 py-2 bg-surface-elevated border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || !newSessionName.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </form>
        </div>

        {/* Sessions List */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">
            Your Sessions
          </h2>

          {sessions.length === 0 ? (
            <div className="p-8 bg-surface-elevated border border-border rounded-lg text-center">
              <p className="text-text-secondary">
                No sessions yet. Create one above to start roleplaying.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/session/${session.id}`}
                  className="block p-4 bg-surface-elevated border border-border rounded-lg hover:border-border-strong transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-text-primary">
                        {session.name}
                      </h3>
                      <p className="text-sm text-text-muted">
                        Owner: {session.owner_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          session.status === "active"
                            ? "bg-status-success/10 text-status-success"
                            : "bg-text-muted/10 text-text-muted"
                        }`}
                      >
                        {session.status}
                      </span>
                      <span className="text-xs text-text-muted">
                        {new Date(session.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-12 text-center text-text-muted text-xs">
          <p>
            Ollama: 192.168.4.2:11434 | TTS: 192.168.4.2:8880
          </p>
        </div>
      </main>
    </div>
  );
}
