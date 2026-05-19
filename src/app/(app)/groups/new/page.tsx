"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { logger } from "@/lib/logger";

export default function NewGroupPage() {
  const router = useRouter();
  const { refreshAll } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });

      const data = await res.json();
      logger.debug("Create group response:", res.status, data);

      if (!res.ok) {
        setError(data.error || "Failed to create group");
        return;
      }

      refreshAll();
      router.push("/groups");
    } catch (err) {
      console.error("Create group error:", err);
      setError("Failed to create group");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Back */}
      <Link
        href="/groups"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to groups
      </Link>

      {/* Form */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
        <h1 className="text-base font-semibold text-text-primary mb-4">Create Group</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Campaign"
              className="w-full rounded-lg border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your group..."
              rows={3}
              className="w-full rounded-lg border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-error">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/groups"
              className="rounded-lg px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-raised"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
