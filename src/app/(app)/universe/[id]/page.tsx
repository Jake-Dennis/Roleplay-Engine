"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Sparkles, AlertCircle, Check, Clock, GitBranch } from "lucide-react";

interface Universe {
  id: string;
  name: string;
  description: string | null;
  canon_mode: string;
  lore_source: string | null;
  tone: string | null;
  time_period: string | null;
  boundaries: string[];
  created_at: string;
}

interface Session {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
}

export default function UniverseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [universe, setUniverse] = useState<Universe | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("");
  const [timePeriod, setTimePeriod] = useState("");
  const [canonMode, setCanonMode] = useState("strict");
  const [loreSource, setLoreSource] = useState("");
  const [boundaries, setBoundaries] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/universes/${id}`),
      fetch(`/api/sessions`),
    ])
      .then(async ([uRes, sRes]) => {
        if (!uRes.ok) throw new Error("Not found");
        const uData = await uRes.json();
        const sData = await sRes.json();

        setUniverse(uData.universe);
        setName(uData.universe.name);
        setDescription(uData.universe.description || "");
        setTone(uData.universe.tone || "");
        setTimePeriod(uData.universe.time_period || "");
        setCanonMode(uData.universe.canon_mode);
        setLoreSource(uData.universe.lore_source || "");
        // Boundaries: array → one per line for textarea
        setBoundaries(Array.isArray(uData.universe.boundaries) ? uData.universe.boundaries.join("\n") : "");

        // Filter sessions belonging to this universe
        // API returns camelCase keys via camelizeKeys, so use universeId
        const universeSessions = (sData.sessions || []).filter(
          (s: Session & { universe_id?: string | null; universeId?: string | null }) => (s.universeId ?? s.universe_id) === id
        );
        setSessions(universeSessions);

        setLoading(false);
      })
      .catch(() => router.push("/universe"));
  }, [id, router]);

  // Clear messages after 3s
  useEffect(() => {
    if (error || saved) {
      const t = setTimeout(() => { setError(null); setSaved(false); }, 4000);
      return () => clearTimeout(t);
    }
  }, [error, saved]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // Boundaries: one per line → array
      const boundariesArray = boundaries
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/universes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          tone: tone.trim() || null,
          time_period: timePeriod.trim() || null,
          canon_mode: canonMode,
          lore_source: loreSource.trim() || null,
          boundaries: boundariesArray,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setUniverse(json.universe);
        setSaved(true);
      } else {
        setError(json.error || "Failed to save");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading universe...</span>
      </div>
    );
  }

  if (!universe) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        href="/universe"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to universes
      </Link>

      {/* Error / Success banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <Check className="h-3.5 w-3.5 flex-shrink-0" />
          Saved successfully
        </div>
      )}

      <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
        <h1 className="text-base font-semibold text-text-primary">Edit Universe</h1>
        <p className="mt-1 text-xs text-text-muted">
          Created {new Date(universe.created_at).toLocaleDateString()}
        </p>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
              rows={3}
              placeholder="Describe your world — the LLM will use this as world context. e.g., A high fantasy world where the Dark Lord Sauron forged the One Ring..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Tone</label>
            <input
              type="text"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
              placeholder="e.g., dark fantasy"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Time Period</label>
            <input
              type="text"
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
              placeholder="e.g., medieval, 1920s, far future"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Canon Mode</label>
            <select
              value={canonMode}
              onChange={(e) => setCanonMode(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
            >
              <option value="strict">Strict — Only official lore, no contradictions</option>
              <option value="loose">Loose — Can expand canon, no major contradictions</option>
              <option value="custom">Custom — Define your own rules</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Lore Source</label>
            <input
              type="text"
              value={loreSource}
              onChange={(e) => setLoreSource(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
              placeholder="e.g., wiki URL or file path"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">
              Boundaries
              <span className="text-text-muted ml-1">(one per line)</span>
            </label>
            <textarea
              value={boundaries}
              onChange={(e) => setBoundaries(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
              rows={4}
              placeholder={"e.g.\nNo modern technology\nNo time travel"}
            />
          </div>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Associated Sessions */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <Clock className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Sessions ({sessions.length})</h2>
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs text-text-muted">No sessions in this universe</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/session/${s.id}`}
                className="flex items-center justify-between rounded-lg bg-bg-raised px-3.5 py-2.5 transition-colors hover:bg-bg-highlight"
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-text-muted" />
                  <span className="text-xs text-text-primary">{s.name}</span>
                </div>
                <span className="text-xxs text-text-muted capitalize">{s.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
