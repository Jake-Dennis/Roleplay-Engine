"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface BenchmarkPoint {
  contextSize: number;
  tokPerSec: number;
  success: boolean;
  durationMs: number;
}

const TEST_SIZES = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];

export default function BenchmarkPage() {
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [results, setResults] = useState<Map<number, BenchmarkPoint>>(new Map());
  const [testing, setTesting] = useState<number | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelMaxCtx, setModelMaxCtx] = useState<number | null>(null);

  // Fetch available models and auto-select current model from server config
  useEffect(() => {
    Promise.all([
      fetch("/api/ollama/models", { credentials: "include" }).then(r => r.json()),
      fetch("/api/settings", { credentials: "include" }).then(r => r.json()),
    ]).then(([modelsData, settingsData]) => {
      if (modelsData.models) setModels(modelsData.models);
      const currentModel = settingsData?.ollama?.model || "";
      if (currentModel && modelsData.models?.includes(currentModel)) {
        setModel(currentModel);
      }
      if (currentModel && settingsData?.modelDefaults?.[currentModel]?.numCtx) {
        setModelMaxCtx(settingsData.modelDefaults[currentModel].numCtx);
      }
    }).catch(() => {});
  }, []);

  // When model changes, detect its native context window via Ollama's /api/show
  useEffect(() => {
    if (!model) { setModelMaxCtx(null); return; }
    fetch(`/api/models/ollama/show?model=${encodeURIComponent(model)}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.contextWindow) setModelMaxCtx(data.contextWindow);
      })
      .catch(() => {});
  }, [model]);

  const testSizes = TEST_SIZES;

  // Load saved results when model changes
  useEffect(() => {
    if (!model) { setResults(new Map()); return; }
    fetch(`/api/benchmark?model=${encodeURIComponent(model)}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.results) {
          const m = new Map<number, BenchmarkPoint>();
          for (const p of data.results) m.set(p.contextSize, p);
          setResults(m);
        }
      })
      .catch(() => {});
  }, [model]);

  const testSize = useCallback(async (ctx: number) => {
    if (!model || testing) return;
    setTesting(ctx);
    setError(null);
    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ model, contextSize: ctx, thinkingMode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const point: BenchmarkPoint = await res.json();
      setResults(prev => new Map(prev).set(ctx, point));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setTesting(null);
    }
  }, [model, testing, thinkingMode]);

  const runAll = async () => {
    if (!model || runningAll) return;
    setRunningAll(true);
    setError(null);
    for (const ctx of testSizes) {
      if (results.has(ctx)) continue;
      setTesting(ctx);
      try {
        const res = await fetch("/api/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ model, contextSize: ctx, thinkingMode }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const point: BenchmarkPoint = await res.json();
        setResults(prev => new Map(prev).set(ctx, point));
      } catch (e: unknown) {
        setError(`${(ctx / 1024).toFixed(0)}K failed: ${(e as Error).message}`);
      }
    }
    setTesting(null);
    setRunningAll(false);
  };

  const testedCount = testSizes.filter(ctx => results.has(ctx)).length;
  const failedCount = testSizes.filter(ctx => {
    const p = results.get(ctx);
    return p && !p.success;
  }).length;

  // Find best size: highest context size with good speed (>10 tok/s) and quality (>60%)
  // Find best size: highest context size with usable speed
  const bestSize = (() => {
    let best: { size: number; score: number } | null = null;
    for (const ctx of testSizes) {
      const p = results.get(ctx);
      if (!p || !p.success) continue;
      // Score favors higher context size, but penalizes slow speeds
      const speedScore = Math.min(p.tokPerSec / 20, 1); // 20+ tok/s = perfect
      const sizeBonus = Math.log2(ctx / 4096) * 0.1;
      const total = speedScore * 0.7 + sizeBonus * 0.3;
      if (!best || total > best.score) {
        best = { size: ctx, score: total };
      }
    }
    return best;
  })();

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Roleplay Benchmark</h1>
        <p className="text-xs text-text-muted mt-1">
          Find the best context size for your model. Tests speed, quality, and memory at each size.
        </p>
      </div>

      {/* Model selector */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5 space-y-4">
        <div>
          <label className="text-xs text-text-secondary block mb-1">Model</label>
          <select
            value={model}
            onChange={e => { setModel(e.target.value); setResults(new Map()); }}
            disabled={runningAll}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Select a model...</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {model && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" checked={thinkingMode} onChange={e => setThinkingMode(e.target.checked)} disabled={runningAll} className="rounded border-border-default" />
              Thinking mode
            </label>
            {modelMaxCtx && (
              <span className="text-xxs text-text-muted">
                Max context: {(modelMaxCtx / 1024).toFixed(0)}K
              </span>
            )}
            <Button onClick={runAll} variant="primary" size="sm" disabled={!model || runningAll}>
              {runningAll ? (
                <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Running...</>
              ) : (
                <><Play className="mr-1 h-3.5 w-3.5" /> Run All</>
              )}
            </Button>
            {testedCount > 0 && (
              <span className="text-xxs text-text-muted">
                {testedCount}/{testSizes.length} tested
                {failedCount > 0 && ` (${failedCount} failed)`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Size buttons grid */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <h2 className="text-sm font-medium text-text-primary mb-3">Context Sizes</h2>
        <div className="grid grid-cols-4 gap-2">
          {testSizes.map(ctx => {
            const done = results.get(ctx);
            const running = testing === ctx;
            return (
              <button
                key={ctx}
                onClick={() => testSize(ctx)}
                disabled={!model || testing !== null || runningAll}
                className={`relative flex flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-sm transition-colors ${
                  running
                    ? "border-accent bg-accent/10 animate-pulse"
                    : done
                    ? done.success
                      ? "border-status-success/40 bg-status-success/10"
                      : "border-status-error/40 bg-status-error/10"
                    : "border-border-default bg-bg-raised hover:border-accent/50"
                }`}
              >
                <span className="font-medium text-text-primary">{(ctx / 1024).toFixed(0)}K</span>
                {ctx === modelMaxCtx && <span className="text-[9px] text-text-muted">max</span>}
                {running && <Loader2 className="mt-1 h-3 w-3 animate-spin text-accent" />}
                {done && !running && (
                  done.success
                    ? <CheckCircle2 className="mt-1 h-3 w-3 text-status-success" />
                    : <XCircle className="mt-1 h-3 w-3 text-status-error" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-xs text-status-error">{error}</div>
      )}

      {/* Results table */}
      {results.size > 0 && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-3">
            Results {model && <span className="text-text-muted">— {model}</span>}
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-muted">
                <th className="py-1 text-left font-medium pr-3">Context</th>
                <th className="py-1 text-left font-medium pr-3">Speed</th>
                <th className="py-1 text-left font-medium pr-3">Time</th>
                <th className="py-1 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {testSizes.filter(ctx => results.has(ctx)).map(ctx => {
                const p = results.get(ctx)!;
                const durMs = p.durationMs || 0;
                const timeStr = durMs >= 60000
                  ? `${(durMs / 60000).toFixed(1)}m`
                  : durMs >= 1000
                    ? `${(durMs / 1000).toFixed(0)}s`
                    : "-";
                const isBest = bestSize && bestSize.size === ctx;
                return (
                  <tr key={ctx} className={`border-b border-border-default/30 ${isBest ? "bg-status-success/5" : ""}`}>
                    <td className="py-1 pr-3 font-mono text-text-primary">
                      {(ctx / 1024).toFixed(0)}K
                      {isBest && <span className="ml-1.5 text-xxs text-status-success font-medium">★ best</span>}
                      {ctx === modelMaxCtx && !isBest && <span className="ml-1.5 text-xxs text-text-muted">(max)</span>}
                    </td>
                    <td className="py-1 pr-3 font-mono text-text-muted">
                      {p.success ? `${p.tokPerSec.toFixed(1)} tok/s` : "-"}
                    </td>
                    <td className="py-1 pr-3 font-mono text-text-muted">
                      {p.success ? timeStr : "-"}
                    </td>
                    <td className="py-1 font-mono">
                      {p.success
                        ? <span className="text-status-success">OK</span>
                        : <span className="text-status-error">Failed</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Recommendation */}
          {bestSize && (
            <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    Recommended: <span className="text-accent">{(bestSize.size / 1024).toFixed(0)}K</span> context window
                  </p>
                  <p className="text-xxs text-text-muted mt-1">
                    Best balance of context size and speed ({(results.get(bestSize.size)?.tokPerSec ?? 0).toFixed(1)} tok/s)
                    for {model}. Set this as num_ctx in Server Settings → Model Defaults.
                    Sizes above this may be slower or unstable.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
