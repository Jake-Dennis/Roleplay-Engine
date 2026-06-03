"use client";

import { useState, useEffect, useRef } from "react";
import { Gauge, Play, Trash2, RefreshCw, Check, AlertCircle, Sparkles } from "lucide-react";

interface BenchmarkResult {
  id: number;
  model: string;
  max_ctx_load: number | null;
  max_ctx_stress: number | null;
  stress_passed: number;
  gen_speed: number | null;
  prompt_tokens: number | null;
  host: string | null;
  tested_at: string;
  rounds?: BenchmarkRound[];
  recommended_num_predict?: number | null;
  speed_at_25?: number | null;
  speed_at_100?: number | null;
  nih_results?: NihResult[];
}

interface NihResult {
  position: number;
  passed: boolean;
  response?: string;
  error?: string;
  generatedTokens?: number;
  tokensPerSec?: string | number;
}

interface BenchmarkRound {
  ctx: number;
  p: string;     // phase: "exponential" | "binary" | "stress"
  ok: number;    // 1 = pass, 0 = fail
  tps: number | null;
  pt: number | null;
  gt: number | null;
  e: string | null;
}

interface HistoryEntry {
  id: number;
  model: string;
  max_ctx_load: number | null;
  max_ctx_stress: number | null;
  stress_passed: number;
  gen_speed: number | null;
  tested_at: string;
}

interface ContextBenchmarkSectionProps {
  defaultModel: string;
  localModels: string[];
}

function formatCtx(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1024) return `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)}k`;
  return String(n);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function ContextBenchmarkSection({ defaultModel, localModels }: ContextBenchmarkSectionProps) {
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [minCtx, setMinCtx] = useState(4096);
  const [maxCtx, setMaxCtx] = useState(262144);

  const [latest, setLatest] = useState<BenchmarkResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadResults(forModel: string) {
    try {
      const res = await fetch(`/api/settings/benchmark?model=${encodeURIComponent(forModel)}`);
      if (!res.ok) throw new Error("Failed to fetch results");
      const data = await res.json();
      setLatest(data.latest);
      setHistory(data.history || []);
      setRunning(!!data.running);
      setStartedAt(data.runningStartedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }

  // Initial load + whenever model changes. Skip the fetch when no model is
  // selected yet — the parent passes defaultModel="" until settings load, and
  // hitting the API with model= returns a 400.
  useEffect(() => {
    if (!selectedModel) return;
    setLoading(true);
    setError("");
    loadResults(selectedModel);
  }, [selectedModel]);

  // Poll while running
  useEffect(() => {
    if (running) {
      pollRef.current = setInterval(() => loadResults(selectedModel), 5000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running, selectedModel]);

  async function handleRun() {
    setError("");
    try {
      const res = await fetch("/api/settings/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, min: minCtx, max: maxCtx }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setError(`Already running: ${data.runningModel}`);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start benchmark");
      }
      setRunning(true);
      setStartedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start benchmark");
    }
  }

  async function handleClear() {
    if (!confirm(`Clear all benchmark results for ${selectedModel}?`)) return;
    setError("");
    try {
      await fetch(`/api/settings/benchmark?model=${encodeURIComponent(selectedModel)}`, {
        method: "DELETE",
      });
      await loadResults(selectedModel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear results");
    }
  }

  async function handleRefresh() {
    setLoading(true);
    await loadResults(selectedModel);
  }

  return (
    <div
      className="rounded-xl border border-border-default bg-bg-elevated p-5"
      title="Run a benchmark to find the maximum usable context window for any model. Results are saved per model and include a stress test to confirm real-world usability."
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Gauge className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Context Window Benchmark</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-text-muted hover:text-text-primary transition-colors"
          title="Refresh results from database"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="text-xs text-text-muted mb-4">
        Uses exponential + binary search (~15-20 rounds) plus a full prompt-eval stress test at the boundary.
        Results are saved to the database per model.
      </p>

      {/* Model selector + range */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2">
          <label
            className="w-28 text-xs text-text-secondary"
            title="The model to benchmark. Must be pulled to your Ollama host first."
          >
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={running}
            className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent disabled:opacity-50"
            title="The model to benchmark. Must be pulled to your Ollama host first."
          >
            {(() => {
              const set = new Set([selectedModel, ...localModels, defaultModel].filter(Boolean));
              return Array.from(set).map(m => <option key={m} value={m}>{m}</option>);
            })()}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            className="w-28 text-xs text-text-secondary"
            title="Lower bound for the search. Benchmark starts at this context size and doubles up until failure or max."
          >
            Min Context
          </label>
          <input
            type="number"
            value={minCtx}
            onChange={(e) => setMinCtx(parseInt(e.target.value, 10) || 0)}
            disabled={running}
            step={1024}
            min={1024}
            className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent disabled:opacity-50"
            title="Lower bound for the search. Benchmark starts at this context size and doubles up until failure or max."
          />
        </div>

        <div className="flex items-center gap-2">
          <label
            className="w-28 text-xs text-text-secondary"
            title="Upper bound for the search. Benchmark will not test beyond this context size."
          >
            Max Context
          </label>
          <input
            type="number"
            value={maxCtx}
            onChange={(e) => setMaxCtx(parseInt(e.target.value, 10) || 0)}
            disabled={running}
            step={1024}
            min={1024}
            className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent disabled:opacity-50"
            title="Upper bound for the search. Benchmark will not test beyond this context size."
          />
        </div>
      </div>

      {/* Run button + status */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleRun}
          disabled={running || !selectedModel}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          title={running ? "Benchmark in progress" : "Start a new benchmark run for the selected model"}
        >
          {running ? (
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? "Running…" : "Run Benchmark"}
        </button>

        {running && startedAt && (
          <span
            className="text-xs text-text-muted"
            title="Benchmark runs as a background process. This page will auto-refresh when it completes."
          >
            Started {formatTime(startedAt)}
          </span>
        )}

        {latest && !running && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-secondary hover:text-error hover:border-error transition-colors"
            title="Delete all benchmark results for this model"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-error mb-3">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Latest result */}
      {loading ? (
        <div className="flex items-center gap-2 text-text-muted">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          <span className="text-xs">Loading results…</span>
        </div>
      ) : latest ? (
        <div className="rounded-lg border border-border-default bg-bg-raised p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            {running ? (
              <Sparkles className="h-3.5 w-3.5 text-accent animate-pulse" />
            ) : (
              <Check className="h-3.5 w-3.5 text-success" />
            )}
            <span className="text-xs font-medium text-text-primary">
              {running ? "Live Progress" : "Latest Result"}
            </span>
            {running && latest.rounds && latest.rounds.length > 0 && (
              <span className="text-xs text-text-muted" title="Number of test rounds completed so far">
                {latest.rounds.length} round{latest.rounds.length === 1 ? "" : "s"} so far
              </span>
            )}
            <span className="text-xs text-text-muted ml-auto" title={latest.tested_at}>
              {running ? `started ${formatTime(latest.tested_at)}` : formatTime(latest.tested_at)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {running && (!latest.rounds || latest.rounds.length === 0) && (
              <div className="col-span-2 text-text-muted italic text-center py-2">
                Starting benchmark… warming up model
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-muted" title="Highest context size that loaded and generated successfully.">Loads up to</span>
              <span className="text-text-primary font-medium">{formatCtx(latest.max_ctx_load)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted" title="Context size where the model passed the full prompt-eval stress test.">Stress test</span>
              <span className={`font-medium ${latest.stress_passed ? "text-success" : "text-warning"}`}>
                {latest.stress_passed ? "✅ Passed" : "⚠️ Failed"} @ {formatCtx(latest.max_ctx_stress)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted" title="Generation speed from the last passing round (stress test or binary search).">Gen speed</span>
              <span className="text-text-primary font-medium">
                {latest.gen_speed != null ? `${(typeof latest.gen_speed === 'string' ? parseFloat(latest.gen_speed) : latest.gen_speed).toFixed(1)} t/s` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted" title="Prompt token count from the last passing round.">Prompt tokens</span>
              <span className="text-text-primary font-medium">
                {latest.prompt_tokens != null ? latest.prompt_tokens.toLocaleString() : "—"}
              </span>
            </div>
            {latest.recommended_num_predict != null && (
              <div className="flex justify-between">
                <span className="text-text-muted" title="Highest num_predict the model could produce cleanly (full token count returned).">Max output</span>
                <span className="text-text-primary font-medium">{latest.recommended_num_predict.toLocaleString()} tokens</span>
              </div>
            )}
            {latest.speed_at_25 != null && latest.speed_at_100 != null && (
              <div className="col-span-2 flex justify-between pt-1 border-t border-border-default mt-1">
                <span className="text-text-muted" title="Gen speed at 25% and 100% of max context. The drop shows how much speed you lose as context fills up.">Speed drop</span>
                <span className="text-text-primary font-medium">
                  {latest.speed_at_25} → {latest.speed_at_100} t/s
                  <span className="text-text-muted ml-1">
                    ({Math.round((1 - (latest.speed_at_100 || 0) / Math.max(1, latest.speed_at_25)) * 100)}% drop)
                  </span>
                </span>
              </div>
            )}

            {/* NIH attention test — does the model actually attend to mid-context content? */}
            {latest.nih_results && latest.nih_results.length > 0 && (
              <div className="col-span-2 pt-1 border-t border-border-default mt-1">
                <div className="flex justify-between mb-1">
                  <span
                    className="text-text-muted"
                    title="Needle-in-a-haystack: a unique fact was planted at each position in a long context. The model was asked to recall it. ✅ = recalled, ❌ = lost. Catches 'lost in the middle' failures that load tests miss."
                  >
                    Attention test
                  </span>
                  <span className="text-text-primary font-medium">
                    {latest.nih_results.filter(r => r.passed).length}/{latest.nih_results.length}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {latest.nih_results.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded px-1.5 py-1 text-center text-[10px] ${
                        r.passed
                          ? "bg-success/20 text-success"
                          : r.error
                            ? "bg-text-muted/20 text-text-muted"
                            : "bg-error/20 text-error"
                      }`}
                      title={
                        r.error
                          ? `Error: ${r.error}`
                          : r.passed
                            ? `At ${(r.position * 100).toFixed(0)}%: recalled the needle`
                            : `At ${(r.position * 100).toFixed(0)}%: missed. Said: "${(r.response || "").slice(0, 80)}"`
                      }
                    >
                      <div className="font-medium">{(r.position * 100).toFixed(0)}%</div>
                      <div>{r.passed ? "✅" : r.error ? "—" : "❌"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {latest.host && (
              <div className="col-span-2 flex justify-between pt-1 border-t border-border-default mt-1">
                <span className="text-text-muted" title="Ollama host that was tested.">Host</span>
                <span className="text-text-secondary font-mono text-[10px]">{latest.host}</span>
              </div>
            )}
          </div>

          {/* Apply button — sets num_ctx + num_predict from the recommended profile */}
          {!running && (latest.max_ctx_stress != null || latest.recommended_num_predict != null) && (
            <div className="mt-3 pt-3 border-t border-border-default">
              <button
                onClick={async () => {
                  const changes: Record<string, number> = {};
                  if (latest.max_ctx_stress != null) changes.ollamaNumCtx = latest.max_ctx_stress;
                  if (latest.recommended_num_predict != null) changes.ollamaNumPredict = latest.recommended_num_predict;
                  try {
                    const res = await fetch("/api/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(changes),
                    });
                    if (!res.ok) throw new Error("Failed to save");
                    setApplyMsg("Applied!");
                  } catch {
                    setApplyMsg("Failed to save");
                  }
                  setTimeout(() => setApplyMsg(null), 3000);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
                title="Set num_ctx and num_predict from this benchmark's recommended profile"
              >
                <Check className="h-3 w-3" />
                Apply recommended profile
              </button>
              {applyMsg && (
                <span className={`ml-2 text-xs ${applyMsg === "Applied!" ? "text-success" : "text-error"}`}>
                  {applyMsg === "Applied!" ? "✅ Applied — refresh to see update" : "❌ " + applyMsg}
                </span>
              )}
            </div>
          )}

          {/* Round-by-round breakdown */}
          {latest.rounds && latest.rounds.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-default">
              <details open>
                <summary className="text-xs text-text-muted hover:text-text-primary cursor-pointer select-none mb-2">
                  Round-by-round ({latest.rounds.length} tests)
                </summary>
                <div className="rounded-lg border border-border-default bg-bg-raised overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-bg-elevated">
                      <tr className="text-left text-text-muted">
                        <th className="px-2 py-1.5 font-medium" title="Context size tested">Context</th>
                        <th className="px-2 py-1.5 font-medium" title="Search phase">Phase</th>
                        <th className="px-2 py-1.5 font-medium" title="Pass or fail">Result</th>
                        <th className="px-2 py-1.5 font-medium" title="Tokens per second">Speed</th>
                        <th className="px-2 py-1.5 font-medium" title="Tokens generated">Gen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.rounds.map((r, i) => (
                        <tr key={i} className="border-t border-border-default">
                          <td className="px-2 py-1.5 text-text-primary font-medium">{formatCtx(r.ctx)}</td>
                          <td className="px-2 py-1.5 text-text-secondary text-[10px]">{r.p}</td>
                          <td className={`px-2 py-1.5 ${r.ok ? "text-success" : "text-error"}`}>
                            {r.ok ? "✅" : "❌"}
                          </td>
                          <td className="px-2 py-1.5 text-text-primary">
                            {r.tps != null ? `${r.tps} t/s` : r.e ? <span className="text-text-muted text-[10px]" title={r.e}>{r.e.slice(0, 30)}</span> : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-text-secondary">
                            {r.gt != null ? r.gt.toLocaleString() : r.pt != null ? `${r.pt}pt` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}
        </div>
      ) : !running ? (
        <div className="rounded-lg border border-dashed border-border-default p-3 mb-3">
          <p className="text-xs text-text-muted text-center">
            No benchmark results yet for {selectedModel}. Click "Run Benchmark" to start.
          </p>
        </div>
      ) : null}

      {/* History */}
      {history.length > 1 && (
        <details className="mt-3">
          <summary
            className="text-xs text-text-muted hover:text-text-primary cursor-pointer select-none"
            title={`Show last ${Math.min(history.length, 10)} benchmark runs for this model`}
          >
            History ({history.length} run{history.length === 1 ? "" : "s"})
          </summary>
          <div className="mt-2 rounded-lg border border-border-default bg-bg-raised overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-bg-elevated">
                <tr className="text-left text-text-muted">
                  <th className="px-2 py-1.5 font-medium" title="When the benchmark was run">When</th>
                  <th className="px-2 py-1.5 font-medium" title="Highest context size that loaded and generated successfully">Load</th>
                  <th className="px-2 py-1.5 font-medium" title="Stress test result and context size">Stress</th>
                  <th className="px-2 py-1.5 font-medium" title="Generation speed during stress test">Speed</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-t border-border-default">
                    <td className="px-2 py-1.5 text-text-secondary" title={h.tested_at}>
                      {formatTime(h.tested_at)}
                    </td>
                    <td className="px-2 py-1.5 text-text-primary">{formatCtx(h.max_ctx_load)}</td>
                    <td className={`px-2 py-1.5 ${h.stress_passed ? "text-success" : "text-warning"}`}>
                      {h.stress_passed ? "✅" : "⚠️"} {formatCtx(h.max_ctx_stress)}
                    </td>
                    <td className="px-2 py-1.5 text-text-primary">
                      {h.gen_speed != null ? `${h.gen_speed.toFixed(1)} t/s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
