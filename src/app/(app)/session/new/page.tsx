"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";
import { SessionCreator } from "@/components/session/session-creator";
import { useApp } from "@/contexts/app-context";

export default function NewSessionPage() {
  const router = useRouter();
  const { activeUniverse, activeGroup, refreshAll } = useApp();

  async function handleCreate(data: { name: string; universe_id: string | null; type: string }) {
    if (!activeUniverse) return;

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        universe_id: activeUniverse.id,
        type: data.type,
        group_id: activeGroup?.id || null,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Failed to create session");
    }

    // Refresh all data
    refreshAll();

    router.push(`/session/${result.session.id}`);
  }

  // No active universe — show a prompt instead of the form
  if (!activeUniverse) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Link
          href="/session"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sessions
        </Link>

        <div className="rounded-xl border border-border-default bg-bg-elevated p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-text-muted" />
          <h2 className="mt-3 text-sm font-medium text-text-primary">Select a universe first</h2>
          <p className="mt-1 text-xs text-text-muted">
            Choose a universe from the sidebar before creating a session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Back */}
      <Link
        href="/session"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sessions
      </Link>

      {/* Form */}
      <SessionCreator
        activeUniverseName={activeUniverse.name}
        onCreate={handleCreate}
      />
    </div>
  );
}
