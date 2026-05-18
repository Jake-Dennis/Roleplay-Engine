"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  MessageSquare,
  Globe,
  Users,
  Clock,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/contexts/app-context";

interface Session {
  id: string;
  name: string;
  universe_id: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  owner_name: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { activeGroup } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = activeGroup ? `/api/sessions?group_id=${activeGroup.id}` : "/api/sessions?scope=personal";
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeGroup?.id]);

  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-xs text-text-muted">Overview of your roleplaying worlds</p>
        </div>
        <Link
          href="/session/new"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Session
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2.5 text-text-muted">
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs">Sessions</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">
            {loading ? "..." : sessions.length}
          </p>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2.5 text-text-muted">
            <Globe className="h-4 w-4" />
            <span className="text-xs">Universes</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">&mdash;</p>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2.5 text-text-muted">
            <Users className="h-4 w-4" />
            <span className="text-xs">Characters</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">&mdash;</p>
        </div>
      </div>

      {/* Recent Sessions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">Recent Sessions</h2>
          <Link
            href="/session"
            className="text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span className="text-xs">Loading sessions...</span>
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-10 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-text-muted" />
            <h3 className="mt-3 text-sm font-medium text-text-primary">No sessions yet</h3>
            <p className="mt-1 text-xs text-text-muted">
              Create your first session to start roleplaying
            </p>
            <Link
              href="/session/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Session
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => router.push(`/session/${session.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-border-default bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-raised"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                    <MessageSquare className="h-4 w-4 text-text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {session.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xxs text-text-muted">
                      <span>{session.status}</span>
                      {session.updated_at && (
                        <>
                          <span>·</span>
                          <Clock className="h-3 w-3" />
                          <span>{new Date(session.updated_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-text-muted" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
