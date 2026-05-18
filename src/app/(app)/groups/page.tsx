"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Users, FolderOpen } from "lucide-react";
import { useApp } from "@/contexts/app-context";

interface Group {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  session_count: number;
  universe_count: number;
  created_at: string;
}

export default function GroupsPage() {
  const router = useRouter();
  const { groups, loading, refreshAll } = useApp();
  const [localGroups, setLocalGroups] = useState<Group[]>([]);

  useEffect(() => {
    setLocalGroups(groups as Group[]);
  }, [groups]);

  async function deleteGroup(id: string) {
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    setLocalGroups((prev) => prev.filter((g) => g.id !== id));
    refreshAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <span className="text-xs">Loading groups...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Groups</h1>
          <p className="mt-1 text-xs text-text-muted">Manage your roleplaying groups</p>
        </div>
        <Link
          href="/groups/new"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Group
        </Link>
      </div>

      {/* Group list */}
      {localGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-default p-8 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary mb-1">No groups yet</p>
          <p className="text-xs text-text-muted mb-4">Create a group to share universes and sessions with others</p>
          <Link
            href="/groups/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Group
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {localGroups.map((group) => (
            <div
              key={group.id}
              className="rounded-xl border border-border-default bg-bg-elevated p-4 transition-colors hover:border-accent/30"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary truncate">
                    {group.name}
                  </h3>
                  {group.description && (
                    <p className="mt-1 text-xs text-text-muted line-clamp-2">
                      {group.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xxs text-text-muted">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {group.member_count} member{group.member_count !== 1 ? "s" : ""}
                </span>
                <span>{group.session_count} session{group.session_count !== 1 ? "s" : ""}</span>
                <span>{group.universe_count} universe{group.universe_count !== 1 ? "s" : ""}</span>
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/groups/${group.id}`}
                  className="flex-1 rounded-md bg-bg-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight text-center"
                >
                  Manage
                </Link>
                <button
                  onClick={() => {
                    router.push("/session");
                  }}
                  className="flex-1 rounded-md bg-bg-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
                >
                  Enter
                </button>
                <button
                  onClick={() => deleteGroup(group.id)}
                  className="rounded-md bg-error/10 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/20"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
