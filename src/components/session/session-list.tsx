/**
 * SessionList Component
 *
 * Displays a list of roleplaying sessions with status and type badges.
 * Extracted from session/page.tsx.
 *
 * Usage:
 *   <SessionList
 *     sessions={sessions}
 *     loading={loading}
 *     onSessionClick={(id) => navigate(id)}
 *     onDelete={(id) => setDeleteTarget(id)}
 *   />
 */

"use client";

import { MessageSquare, Clock, Trash2, Users, User } from "lucide-react";

interface Session {
  id: string;
  name: string;
  type?: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  owner_name: string;
}

interface SessionListProps {
  sessions: Session[];
  loading: boolean;
  onSessionClick: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function SessionList({ sessions, loading, onSessionClick, onDelete }: SessionListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
        <MessageSquare className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading sessions...</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-text-muted" />
        <h3 className="mt-3 text-sm font-medium text-text-primary">No sessions</h3>
        <p className="mt-1 text-xs text-text-muted">
          Create a session to start roleplaying
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onSessionClick(session.id)}
          className="flex cursor-pointer items-center justify-between rounded-lg border border-border-default bg-bg-elevated px-4 py-3 transition-colors hover:bg-bg-raised"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              {session.type === "group" ? (
                <Users className="h-4 w-4 text-text-accent" />
              ) : (
                <MessageSquare className="h-4 w-4 text-text-accent" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-text-primary">{session.name}</p>
                <span className={`rounded-full px-1.5 py-0.5 text-xxs font-medium ${
                  session.type === "group"
                    ? "bg-accent/10 text-accent"
                    : "bg-bg-raised text-text-muted"
                }`}>
                  {session.type === "group" ? "Group" : "Solo"}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xxs text-text-muted">
                <span className="capitalize">{session.status}</span>
                <span>·</span>
                <User className="h-3 w-3" />
                <span>{session.owner_name}</span>
                <span>·</span>
                <Clock className="h-3 w-3" />
                <span>
                  {session.updated_at
                    ? new Date(session.updated_at).toLocaleDateString()
                    : new Date(session.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session.id);
              }}
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-bg-raised hover:text-error"
              title="Delete session"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
