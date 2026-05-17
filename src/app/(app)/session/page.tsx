"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Users,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { SessionList } from "@/components/session/session-list";

interface Session {
  id: string;
  name: string;
  type?: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  owner_name: string;
}

interface Invitation {
  id: string;
  session_id: string;
  session_name: string;
  inviter_username: string;
  created_at: string;
}

export default function SessionListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function loadSessions() {
    try {
      const [sessRes, invRes] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/invitations"),
      ]);
      const sessData = await sessRes.json();
      const invData = await invRes.json();
      setSessions(sessData.sessions || []);
      setInvitations(invData.invitations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  async function deleteSession(id: string) {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setDeleteTarget(null);
  }

  async function acceptInvite(inviteId: string, sessionId: string) {
    const res = await fetch(`/api/sessions/${sessionId}/join`, { method: "POST" });
    if (res.ok) {
      setInvitations((prev) => prev.filter((i) => i.id !== inviteId));
      await loadSessions();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Sessions</h1>
          <p className="mt-1 text-xs text-text-muted">All your roleplaying sessions</p>
        </div>
        <Link
          href="/session/new"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Session
        </Link>
      </div>

      {/* Invitations */}
      {invitations.length > 0 && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <h2 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-accent" />
            Pending Invitations
          </h2>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg bg-bg-elevated px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    {inv.session_name}
                  </p>
                  <p className="text-xxs text-text-muted">
                    Invited by {inv.inviter_username}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => acceptInvite(inv.id, inv.session_id)}
                    className="rounded-md bg-accent px-3 py-1 text-xxs text-white hover:bg-accent-hover"
                  >
                    Join
                  </button>
                  <button
                    onClick={() =>
                      setInvitations((prev) => prev.filter((i) => i.id !== inv.id))
                    }
                    className="rounded-md bg-bg-raised px-3 py-1 text-xxs text-text-secondary hover:bg-bg-highlight"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session list */}
      <SessionList
        sessions={sessions}
        loading={loading}
        onSessionClick={(id) => router.push(`/session/${id}`)}
        onDelete={(id) => setDeleteTarget(id)}
      />

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteSession(deleteTarget)}
        title="Delete Session"
        message="Delete this session? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
