"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SessionCreator } from "@/components/session/session-creator";
import { useApp } from "@/contexts/app-context";

interface Universe {
  id: string;
  name: string;
  group_id: string | null;
}

export default function NewSessionPage() {
  const router = useRouter();
  const { activeUniverse, universes, activeGroup, refreshAll } = useApp();
  const [universeList, setUniverseList] = useState<Universe[]>([]);

  useEffect(() => {
    setUniverseList(universes.length > 0 ? universes : []);
  }, [universes]);

  async function handleCreate(data: { name: string; universe_id: string | null; type: string }) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        universe_id: data.universe_id || activeUniverse?.id || null,
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
        universes={universeList}
        onCreate={handleCreate}
      />
    </div>
  );
}
