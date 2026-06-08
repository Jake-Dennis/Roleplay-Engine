"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, MessageSquare, Edit2, Save, X, Check } from "lucide-react";
import Link from "next/link";

interface Session {
  id: string;
  ownerId: string;
  name: string;
  status: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  ownerName: string;
  universeId: string | null;
  groupId: string | null;
  timelineId: string | null;
  personaId: string | null;
}

interface TurnConfig {
  turnMode: string;
  turnOrder: string[];
  currentTurn: string | null;
}

export default function SessionSettingsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [turnConfigs, setTurnConfigs] = useState<Record<string, TurnConfig>>({});
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sessions?scope=personal")
      .then((r) => r.json())
      .then((data) => { setSessions(data.sessions || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function expand(s: Session) {
    const isExpanded = expandedId === s.id;
    setExpandedId(isExpanded ? null : s.id);
    if (!isExpanded) {
      setEditName(s.name);
      setEditStatus(s.status);
      // Fetch session details for turn config
      fetch(`/api/sessions/${s.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.turnConfig) {
            setTurnConfigs((prev) => ({ ...prev, [s.id]: data.turnConfig }));
          }
        })
        .catch(() => {});
    }
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editName) body.name = editName;
      if (editStatus) body.status = editStatus;

      const res = await fetch(`/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setExpandedId(null);
        setSavedId(id);
        setTimeout(() => setSavedId(null), 3000);
        const data = await res.json();
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name: data.session.name, status: data.session.status } : s)));
      }
    } finally {
      setSaving(false);
    }
  }

  function statusBadgeColor(status: string): string {
    switch (status) {
      case "active": return "bg-success/10 text-success";
      case "ended": return "bg-bg-highlight text-text-muted";
      case "archived": return "bg-warning/10 text-warning";
      default: return "bg-bg-highlight text-text-muted";
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-xs text-text-muted">
        Loading sessions...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-text-primary">Session Settings</h1>
          <p className="mt-1 text-xs text-text-muted">Manage session names, status, and narrative configuration</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-8 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-text-muted mb-3" />
          <p className="text-xs text-text-muted">No sessions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-xl border border-border-default bg-bg-elevated overflow-hidden">
              <button
                onClick={() => expand(s)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-raised transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-text-muted shrink-0" />
                    <span className="text-sm font-medium text-text-primary truncate">{s.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xxs font-medium ${statusBadgeColor(s.status)}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xxs text-text-muted">
                    <span>Type: {s.type}</span>
                    <span className="truncate">Owner: {s.ownerName}</span>
                  </div>
                </div>
                <Edit2 className="h-3.5 w-3.5 text-text-muted shrink-0 ml-3" />
              </button>

              {expandedId === s.id && (
                <div className="border-t border-border-default px-4 py-3 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-text-secondary">Name</label>
                    <input type="text" value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-text-secondary">Status</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                      <option value="active">Active</option>
                      <option value="ended">Ended</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  {turnConfigs[s.id] && (
                    <div className="rounded-lg bg-bg-raised p-3">
                      <h4 className="text-xs font-medium text-text-primary mb-2">Turn Configuration</h4>
                      <div className="space-y-1 text-xxs text-text-muted">
                        <p>Mode: {turnConfigs[s.id].turnMode}</p>
                        <p>Order: {turnConfigs[s.id].turnOrder.length > 0 ? turnConfigs[s.id].turnOrder.join(", ") : "None"}</p>
                        <p>Current: {turnConfigs[s.id].currentTurn || "None"}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button onClick={() => handleSave(s.id)} disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                      <Save className="h-3 w-3" /> Save
                    </button>
                    <button onClick={() => setExpandedId(null)}
                      className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-primary">
                      <X className="h-3 w-3" /> Cancel
                    </button>
                  </div>

                  {savedId === s.id && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-1.5 text-xxs text-success">
                      <Check className="h-3 w-3" /> Saved
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
