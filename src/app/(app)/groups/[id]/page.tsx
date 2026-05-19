"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Users, Globe, MessageSquare,
  UserPlus, Trash2, Edit2, Check, X, Crown, Shield,
} from "lucide-react";
import { useApp } from "@/contexts/app-context";

interface GroupMember {
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  username: string;
}

interface GroupSession {
  id: string;
  name: string;
  type: string;
  owner_id: string;
  updated_at: string;
}

interface GroupUniverse {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

interface GroupDetail {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const { refreshAll } = useApp();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [universes, setUniverses] = useState<GroupUniverse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Add member
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [availableUsers, setAvailableUsers] = useState<{ id: string; username: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  const loadData = useCallback(() => {
    // Browser automatically sends httpOnly cookies with same-origin requests
    fetch(`/api/groups/${groupId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load group");
        return res.json();
      })
      .then((data) => {
        setGroup(data.group);
        setMembers(data.members || []);
        setSessions(data.sessions || []);
        setUniverses(data.universes || []);
        setIsOwner(data.group?.owner_id === (data.members || []).find((m: GroupMember) => m.role === "owner")?.user_id);
        setEditName(data.group?.name || "");
        setEditDescription(data.group?.description || "");
      })
      .catch(() => {
        router.push("/groups");
      })
      .finally(() => setLoading(false));
  }, [groupId, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch available users when search query changes
  useEffect(() => {
    if (!addMemberOpen) return;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      const url = `/api/users?group_id=${groupId}&q=${encodeURIComponent(searchQuery)}`;
      fetch(url)
        .then((res) => res.ok ? res.json() : { users: [] })
        .then((data) => setAvailableUsers(data.users || []))
        .catch(() => setAvailableUsers([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [addMemberOpen, searchQuery, groupId]);

  async function handleSaveGroup() {
    const res = await fetch(`/api/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDescription }),
    });

    if (res.ok) {
      const data = await res.json();
      setGroup(data.group);
      setEditing(false);
      refreshAll();
    }
  }

  async function handleAddMember() {
    if (!selectedUser) return;
    setAddMemberLoading(true);
    setAddMemberError("");

    const res = await fetch(`/api/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: selectedUser.id }),
    });

    const data = await res.json();
    if (res.ok) {
      setSelectedUser(null);
      setSearchQuery("");
      setAddMemberOpen(false);
      loadData();
    } else {
      setAddMemberError(data.error || "Failed to add member");
    }
    setAddMemberLoading(false);
  }

  async function handleRemoveMember(userId: string) {
    await fetch(`/api/groups/${groupId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    loadData();
  }

  async function handleDeleteGroup() {
    if (!confirm(`Delete "${group?.name}"? This cannot be undone.`)) return;

    await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
    router.push("/groups");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <span className="text-xs">Loading group...</span>
      </div>
    );
  }

  if (!group) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/groups" className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            {editing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-base font-semibold text-text-primary bg-bg-raised rounded px-2 py-1 border border-border-default"
                autoFocus
              />
            ) : (
              <h1 className="text-base font-semibold text-text-primary">{group.name}</h1>
            )}
            <p className="mt-1 text-xs text-text-muted">Group management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={handleSaveGroup} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover">
                <Check className="h-3.5 w-3.5" /> Save
              </button>
              <button onClick={() => { setEditing(false); setEditName(group.name); setEditDescription(group.description || ""); }} className="rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-secondary hover:bg-bg-highlight">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-secondary hover:bg-bg-highlight">
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {editing ? (
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="Group description..."
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary placeholder:text-text-muted resize-none"
          rows={2}
        />
      ) : group.description ? (
        <p className="text-xs text-text-secondary">{group.description}</p>
      ) : null}

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2 text-text-muted mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs">Members</span>
          </div>
          <p className="text-lg font-semibold text-text-primary">{members.length}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2 text-text-muted mb-1">
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs">Sessions</span>
          </div>
          <p className="text-lg font-semibold text-text-primary">{sessions.length}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
          <div className="flex items-center gap-2 text-text-muted mb-1">
            <Globe className="h-4 w-4" />
            <span className="text-xs">Universes</span>
          </div>
          <p className="text-lg font-semibold text-text-primary">{universes.length}</p>
        </div>
      </div>

      {/* Members */}
      <div className="rounded-xl border border-border-default bg-bg-elevated">
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Members</h2>
          {isOwner && (
            <button
              onClick={() => setAddMemberOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-bg-raised px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>

        {/* Add member form */}
        {addMemberOpen && (
          <div className="border-b border-border-default px-4 py-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedUser(null); }}
                placeholder="Search users..."
                className="w-full rounded-md border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
                onFocus={() => setAddMemberOpen(true)}
                autoFocus
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">...</div>
              )}

              {/* Dropdown */}
              {searchQuery && availableUsers.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-border-default bg-bg-elevated py-1 shadow-lg max-h-48 overflow-y-auto">
                  {availableUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => { setSelectedUser(user); setSearchQuery(user.username); }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        selectedUser?.id === user.id
                          ? "bg-accent/10 text-text-accent"
                          : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                      }`}
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-raised text-xxs text-text-muted">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{user.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && !searchLoading && availableUsers.length === 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-xs text-text-muted">
                  No users found
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddMember}
                disabled={!selectedUser || addMemberLoading}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {addMemberLoading ? "..." : "Add"}
              </button>
              <button
                onClick={() => { setAddMemberOpen(false); setSelectedUser(null); setSearchQuery(""); setAddMemberError(""); }}
                className="rounded-md bg-bg-raised px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {addMemberError && <p className="mt-2 text-xs text-error">{addMemberError}</p>}
          </div>
        )}

        <div className="divide-y divide-border-default">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-raised text-xs text-text-muted">
                  {member.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-primary">{member.username}</p>
                  <p className="text-xxs text-text-muted">
                    {member.role === "owner" ? (
                      <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-accent" /> Owner</span>
                    ) : (
                      <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Member</span>
                    )}
                  </p>
                </div>
              </div>
              {isOwner && member.role !== "owner" && (
                <button
                  onClick={() => handleRemoveMember(member.user_id)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
                  title="Remove member"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sessions */}
      <div className="rounded-xl border border-border-default bg-bg-elevated">
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Sessions</h2>
          <Link href="/session/new" className="flex items-center gap-1.5 rounded-md bg-bg-raised px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight">
            <MessageSquare className="h-3.5 w-3.5" /> New
          </Link>
        </div>
        {sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">No sessions yet</div>
        ) : (
          <div className="divide-y divide-border-default">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/session/${session.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-bg-raised"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="h-4 w-4 text-text-muted" />
                  <span className="text-xs font-medium text-text-primary">{session.name}</span>
                </div>
                <span className="text-xxs text-text-muted">{session.type}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Universes */}
      <div className="rounded-xl border border-border-default bg-bg-elevated">
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Universes</h2>
          <Link href="/universe" className="flex items-center gap-1.5 rounded-md bg-bg-raised px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-highlight">
            <Globe className="h-3.5 w-3.5" /> New
          </Link>
        </div>
        {universes.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">No universes yet</div>
        ) : (
          <div className="divide-y divide-border-default">
            {universes.map((universe) => (
              <Link
                key={universe.id}
                href={`/universe/${universe.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-bg-raised"
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-text-muted" />
                  <span className="text-xs font-medium text-text-primary">{universe.name}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      {isOwner && (
        <div className="rounded-xl border border-error/30 bg-bg-elevated">
          <div className="border-b border-error/20 px-4 py-3">
            <h2 className="text-sm font-semibold text-error">Danger Zone</h2>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium text-text-primary">Delete Group</p>
              <p className="text-xxs text-text-muted">This will permanently delete the group and all its data</p>
            </div>
            <button
              onClick={handleDeleteGroup}
              className="rounded-md bg-error/10 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/20"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
