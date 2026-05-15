"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  username: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

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
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-text-primary mb-4">
            Welcome, {user?.username}
          </h2>
          <p className="text-text-secondary mb-8">
            Your persistent narrative roleplay engine is ready.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="p-6 bg-surface-elevated border border-border rounded-lg">
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Sessions
              </h3>
              <p className="text-text-secondary text-sm">
                Start or join a roleplay session
              </p>
            </div>

            <div className="p-6 bg-surface-elevated border border-border rounded-lg">
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Universe
              </h3>
              <p className="text-text-secondary text-sm">
                Manage your world and lore
              </p>
            </div>

            <div className="p-6 bg-surface-elevated border border-border rounded-lg">
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Characters
              </h3>
              <p className="text-text-secondary text-sm">
                Create and manage NPCs
              </p>
            </div>
          </div>

          <div className="mt-8 text-text-muted text-xs">
            <p>
              Ollama: 192.168.4.2:11434 | TTS: 192.168.4.2:8880
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
