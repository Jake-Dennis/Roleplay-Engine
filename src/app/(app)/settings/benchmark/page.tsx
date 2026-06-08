"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Gauge,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Target,
  Clock,
  RefreshCw,
  Brain,
  Ruler,
  Sparkles,
  TextSelect,
  Combine,
  BookOpen,
  ScrollText,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================================
// Types
// ============================================================================

interface OllamaModelInfo {
  name: string;
  parameterSize: string;
  family: string;
}

interface ContextTestResult {
  success: boolean;
  maxContextFound: number;
  testedSizes: { size: number; success: boolean; error?: string; isTimeout?: boolean }[];
  oomSize?: number;
  durationMs: number;
}

interface PredictTestResult {
  success: boolean;
  maxPredictFound: number;
  testedSizes: { size: number; success: boolean; error?: string }[];
  oomSize?: number;
  durationMs: number;
}

interface CombinationResult {
  contextSize: number;
  maxNumPredict: number;
  success: boolean;
  resultPredictSizes: { size: number; success: boolean; error?: string }[];
  durationMs: number;
}

interface RoleplayFactResult {
  category: "character" | "location" | "rule";
  fact: string;
  recalled: boolean;
  details: string;
}

interface TurnResult {
  turn: number;
  prompt: string;
  recallRate: number;
  formatScore: number;
  contradictionCount: number;
  factResults: RoleplayFactResult[];
  error?: string;
}

interface RoleplayTestResult {
  lorePackName: string;
  setting: string;
  overallScore: number;
  turnsCompleted: number;
  totalTurns: number;
  averageRecallRate: number;
  averageFormatScore: number;
  totalContradictions: number;
  contradictions: string[];
  turnResults: TurnResult[];
  durationMs: number;
}

interface BenchmarkReport {
  timestamp: string;
  config: {
    model: string;
    ollamaHost: string;
    testContextSizes: number[];
    quickMode: boolean;
    thinkingMode?: boolean;
    maxContextSize?: number;
    maxPredictTokens?: number;
  };
  modelMeta: {
    name: string;
    contextLength: number;
    parameterSize: string;
    quantizationLevel: string;
    family: string;
  };
  contextTest: ContextTestResult;
  predictTest: PredictTestResult;
  combinations: CombinationResult[];
  recommendedNumCtx: number;
  recommendedNumPredict: number;
  warnings: string[];
}

interface BenchmarkJob {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  stage?: string;
  message?: string;
  currentTest?: string;
  stageProgress?: { current: number; total: number };
  config: { model: string; ollamaHost: string; testContextSizes: number[]; quickMode: boolean };
  report?: BenchmarkReport;
  error?: string;
  createdAt: string;
}

// ============================================================================
// Utility
// ============================================================================

function formatDuration(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ============================================================================
// Page Component
// ============================================================================

export default function BenchmarkPage() {
  // Run state
  const [quickMode, setQuickMode] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<boolean>(false);
  const [maxContextSize, setMaxContextSize] = useState<number>(131072);
  const STORAGE_KEY = "benchmark_last_model";
  const [model, setModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || "";
    }
    return "";
  });
  const [availableModels, setAvailableModels] = useState<OllamaModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<BenchmarkJob | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState("");

  // Roleplay test state
  const [roleplayTestId, setRoleplayTestId] = useState<string | null>(null);
  const [roleplayRunning, setRoleplayRunning] = useState(false);
  const [roleplayResult, setRoleplayResult] = useState<RoleplayTestResult | null>(null);
  const [roleplayProgress, setRoleplayProgress] = useState(0);
  const [roleplayError, setRoleplayError] = useState<string | null>(null);
  const roleplayPollRef = useRef<NodeJS.Timeout | null>(null);

  // History
  const [history, setHistory] = useState<BenchmarkJob[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Selected report (for viewing past results)
  const [selectedJob, setSelectedJob] = useState<BenchmarkJob | null>(null);

  // Polling ref
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUserSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.user?.llmModel) setModel(data.user.llmModel);
        if (data.ollama?.host) {
          const port = data.ollama.port || 11434;
          setOllamaUrl(`http://${data.ollama.host}:${port}`);
        }
      }
    } catch {
      // Silently fail - use defaults
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch("/api/benchmark?limit=20", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.benchmarks || []);
        // Auto-select most recent completed
        const latest = (data.benchmarks || []).find((b: BenchmarkJob) => b.status === "completed");
        if (latest && !selectedJob) setSelectedJob(latest);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedJob]);

  // Persist model selection across page visits
  useEffect(() => {
    if (model) localStorage.setItem(STORAGE_KEY, model);
  }, [model]);

  // Fetch initial data
  useEffect(() => {
    fetchHistory();
    fetchUserSettings();
  }, [fetchHistory, fetchUserSettings]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await fetch("/api/models/ollama", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) {
          setAvailableModels(data.models);
          setOllamaConnected(!!data.connected);
        } else {
          setAvailableModels([]);
          setOllamaConnected(false);
        }
      } else {
        setAvailableModels([]);
        setOllamaConnected(false);
      }
    } catch {
      setAvailableModels([]);
      setOllamaConnected(false);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // Auto-detect models once Ollama URL is known
  useEffect(() => {
    if (ollamaUrl) {
      fetchModels();
    }
  }, [ollamaUrl, fetchModels]);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/benchmark/${jobId}`, { credentials: "include" });
      if (res.ok) {
        const job: BenchmarkJob = await res.json();
        setCurrentJob(job);
        if (job.status === "completed" || job.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setRunning(false);
          if (job.status === "completed") {
            await fetchHistory();
            setSelectedJob(job);
          }
        }
      }
    } catch (e) {
      console.error("Poll failed", e);
    }
  }, [fetchHistory]);

  const startBenchmark = async () => {
    if (!model) {
      alert("Please select a model first");
      return;
    }
    setRunning(true);
    setCurrentJob(null);
    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ model, quickMode, thinkingMode, maxContextSize }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { jobId } = await res.json();
      // Start polling
      pollRef.current = setInterval(() => pollJob(jobId), 1500);
      await pollJob(jobId);
    } catch (e: unknown) {
      const err = e as Error;
      alert(`Failed to start benchmark: ${err.message}`);
      setRunning(false);
    }
  };

  const cancelBenchmark = async () => {
    if (!currentJob) return;
    try {
      await fetch(`/api/benchmark/${currentJob.jobId}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setRunning(false);
    setCurrentJob(null);
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm("Delete this benchmark report?")) return;
    try {
      await fetch(`/api/benchmark/${jobId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await fetchHistory();
      if (selectedJob?.jobId === jobId) setSelectedJob(null);
    } catch {
      // ignore
    }
  };

  const applyAutoTune = async (numCtx: number, numPredict: number) => {
    // Apply the recommended numCtx + num_predict to the model that was
    // just benchmarked. Writes to the per-model model_defaults slot
    // (same path as the server settings page "Apply" button).
    // The /api/settings PUT handler merges with the existing map, so
    // this won't clobber other models' overrides.
    if (!report) return;
    const model = report.config.model;
    if (!model) {
      alert("No model in benchmark report");
      return;
    }
    try {
      // Fetch the current map so we can merge (the API also merges, but
      // sending the full map makes the success path more transparent).
      const cur = await fetch("/api/settings").then(r => r.json()).catch(() => ({}));
      const existing = (cur.modelDefaults ?? {}) as Record<string, { numCtx?: number; numPredict?: number }>;
      const updatedMap = {
        ...existing,
        [model]: { ...(existing[model] ?? {}), numCtx, numPredict },
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelDefaults: updatedMap }),
      });
      if (res.ok) {
        alert(`Applied to ${model}: numCtx = ${numCtx.toLocaleString()}, num_predict = ${numPredict.toLocaleString()}`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to apply: ${err.error || "Unknown error"}`);
      }
    } catch (e: unknown) {
      const err = e as Error;
      alert(`Failed to apply: ${err.message}`);
    }
  };

  // ============================================================================
  // Roleplay Standalone Test
  // ============================================================================

  const startRoleplayTest = async () => {
    if (!model) {
      alert("Please select a model first");
      return;
    }
    setRoleplayRunning(true);
    setRoleplayResult(null);
    setRoleplayError(null);
    setRoleplayProgress(0);

    try {
      const res = await fetch("/api/benchmark/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ model, maxContextSize, thinkingMode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { testId } = await res.json();
      setRoleplayTestId(testId);

      roleplayPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/benchmark/roleplay?testId=${testId}`, { credentials: "include" });
          if (pollRes.ok) {
            const data = await pollRes.json();
            setRoleplayProgress(data.progress);
            if (data.status === "completed") {
              setRoleplayResult(data.result);
              setRoleplayRunning(false);
              setRoleplayProgress(100);
              if (roleplayPollRef.current) clearInterval(roleplayPollRef.current);
              roleplayPollRef.current = null;
            } else if (data.status === "failed") {
              setRoleplayError(data.error || "Test failed");
              setRoleplayRunning(false);
              if (roleplayPollRef.current) clearInterval(roleplayPollRef.current);
              roleplayPollRef.current = null;
            }
          }
        } catch {
          // poll silently
        }
      }, 1500);
    } catch (e: unknown) {
      const err = e as Error;
      setRoleplayError(err.message);
      setRoleplayRunning(false);
    }
  };

  // Cleanup roleplay polling on unmount
  useEffect(() => {
    return () => {
      if (roleplayPollRef.current) clearInterval(roleplayPollRef.current);
    };
  }, []);

  const cancelRoleplayTest = async () => {
    if (roleplayPollRef.current) clearInterval(roleplayPollRef.current);
    roleplayPollRef.current = null;
    setRoleplayRunning(false);
    setRoleplayTestId(null);
  };

  const report = selectedJob?.report;
  const showEmptyState = !loadingHistory && history.length === 0 && !running;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Settings
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Gauge className="h-5 w-5 text-accent" />
            <h1 className="text-base font-semibold text-text-primary">LLM Hardware Benchmark</h1>
          </div>
          <Button onClick={fetchHistory} variant="ghost" size="sm" disabled={running}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Find the optimal <code className="text-accent text-xxs">num_ctx</code> × <code className="text-accent text-xxs">num_predict</code> combination for your hardware.
        </p>
      </div>

      {/* Run Section */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Play className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Run Benchmark</h2>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs text-text-secondary">Model</label>
              <button
                onClick={fetchModels}
                disabled={modelsLoading || !ollamaUrl}
                title="Re-detect models from Ollama"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs text-text-muted hover:text-text-primary disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${modelsLoading ? "animate-spin" : ""}`} />
                {modelsLoading ? "Detecting..." : "Refresh"}
              </button>
            </div>
            {modelsLoading && availableModels.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Detecting models from {ollamaUrl || "Ollama"}...
              </div>
            ) : availableModels.length === 0 ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. qwen3.5:4b"
                  disabled={running}
                  className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent disabled:opacity-50"
                />
                <p className="text-xxs text-warning">
                  Could not auto-detect models. Make sure Ollama is reachable at {ollamaUrl || "the configured host"}.
                </p>
              </div>
            ) : (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={running}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent disabled:opacity-50"
              >
                {availableModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.parameterSize}, {m.family})
                  </option>
                ))}
              </select>
            )}
            <div className="mt-1 flex items-center justify-between text-xxs text-text-muted">
              <span>
                {availableModels.length > 0
                  ? `${availableModels.length} model${availableModels.length === 1 ? "" : "s"} available`
                  : "No models detected"}
              </span>
              {ollamaUrl && (
                <span className="flex items-center gap-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${ollamaConnected ? "bg-success" : "bg-error"}`}
                  />
                  {ollamaConnected ? "Connected" : "Unreachable"} · {ollamaUrl}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={quickMode}
                onChange={(e) => setQuickMode(e.target.checked)}
                disabled={running}
                className="rounded border-border-default"
              />
              <span>Quick mode (~60s)</span>
            </label>
            <p className="mt-1 text-xxs text-text-muted">
              {quickMode
                ? "Tests context sizes 2K through 32K, with 5 predict token sizes per context. Good for a quick sanity check."
                : "Tests context sizes 1K through 128K, with a full predict token search at each working context size. May take 3+ minutes."}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinkingMode}
                  onChange={(e) => setThinkingMode(e.target.checked)}
                  disabled={running}
                  className="rounded border-border-default"
                />
                <Brain className="h-3.5 w-3.5 text-text-muted" />
                <span>Thinking mode</span>
              </label>
              <span className="text-xxs text-text-muted">
                {thinkingMode ? "On" : "Off"} (default: Off)
              </span>
            </div>
            <p className="mt-1 text-xxs text-text-muted">
              {thinkingMode
                ? "Model may use reasoning tokens. Inflates generation time — use for accuracy tests, not throughput."
                : "Direct answers only. Recommended for throughput and benchmark accuracy. Disables Qwen3.x reasoning tokens."}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <Ruler className="h-3.5 w-3.5 text-text-muted" />
                <span>Max context to test</span>
              </label>
              <span className="text-xxs text-text-muted">
                {maxContextSize >= 1048576
                  ? "1M"
                  : maxContextSize >= 524288
                  ? "512K"
                  : maxContextSize >= 262144
                  ? "256K"
                  : maxContextSize >= 131072
                  ? "128K"
                  : `${maxContextSize}`}
              </span>
            </div>
            <select
              value={maxContextSize}
              onChange={(e) => setMaxContextSize(Number(e.target.value))}
              disabled={running}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent disabled:opacity-50"
            >
              <option value={32768}>32K — quick, low-end hardware</option>
              <option value={65536}>64K — balanced default</option>
              <option value={131072}>128K — covers most use cases</option>
              <option value={262144}>256K — long documents</option>
              <option value={524288}>512K — book-length contexts</option>
              <option value={1048576}>1M — high-VRAM GPU only</option>
            </select>
            <p className="mt-1 text-xxs text-text-muted">
              Context test will binary search up to this size to find your real max.
              Higher = more accurate, but slower. Tests stop early if the smallest sizes all fail.
            </p>
          </div>

          <div className="flex gap-2">
            {running ? (
              <Button onClick={cancelBenchmark} variant="danger" size="md" disabled={!currentJob}>
                <AlertCircle className="mr-1.5 h-4 w-4" />
                Cancel
              </Button>
            ) : (
              <Button onClick={startBenchmark} variant="primary" size="md" disabled={!model}>
                <Play className="mr-1.5 h-4 w-4" />
                Start Benchmark
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {running && currentJob && (
          <BenchmarkProgressDisplay job={currentJob} />
        )}

        {currentJob?.status === "failed" && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
            <AlertCircle className="h-3.5 w-3.5" />
            {currentJob.error || "Benchmark failed"}
          </div>
        )}
      </div>

      {/* Results Section */}
      {report && <BenchmarkResults report={report} onApply={applyAutoTune} />}

      {/* ================================================================ */}
      {/* Roleplay Lore Test — Standalone */}
      {/* ================================================================ */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Roleplay Lore Fidelity Test</h2>
        </div>
        <p className="text-xxs text-text-muted mb-4">
          Tests how well the model remembers established lore facts (characters, locations, rules)
          across a multi-turn roleplay conversation. Runs 8 turns at your selected context size.
        </p>

        <div className="flex gap-2 mb-4">
          {roleplayRunning ? (
            <Button onClick={cancelRoleplayTest} variant="danger" size="sm" disabled={!roleplayTestId}>
              <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          ) : (
            <Button onClick={startRoleplayTest} variant="primary" size="sm" disabled={!model}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Run Lore Test
            </Button>
          )}
        </div>

        {roleplayRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Running roleplay scenarios...</span>
              <span className="tabular-nums text-text-primary">{roleplayProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
              <div className="h-full bg-accent transition-all duration-300" style={{ width: `${roleplayProgress}%` }} />
            </div>
          </div>
        )}

        {roleplayError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
            <AlertCircle className="h-3.5 w-3.5" />
            {roleplayError}
          </div>
        )}

        {roleplayResult && <RoleplayResults result={roleplayResult} />}
      </div>

      {/* History Section */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-text-primary">History</h2>
          <span className="text-xxs text-text-muted">{history.length} report{history.length !== 1 ? "s" : ""}</span>
        </div>

        {loadingHistory ? (
          <LoadingState message="Loading history..." />
        ) : history.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No benchmarks yet"
            description="Run a benchmark to see results here."
          />
        ) : (
          <div className="space-y-1.5">
            {history.map((job) => (
              <HistoryItem
                key={job.jobId}
                job={job}
                selected={selectedJob?.jobId === job.jobId}
                onSelect={() => setSelectedJob(job)}
                onDelete={() => deleteJob(job.jobId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Progress Display
// ============================================================================

interface BenchmarkProgressDisplayProps {
  job: BenchmarkJob;
}

const STAGE_LABELS: Record<string, { label: string; icon: typeof Play }> = {
  init: { label: "Initializing", icon: Sparkles },
  "model-meta": { label: "Fetching model info", icon: Sparkles },
  "context-test": { label: "Max context test", icon: Target },
  "predict-test": { label: "Max predict test", icon: TextSelect },
  "combination-test": { label: "Combination grid", icon: Combine },
  recommendation: { label: "Recommendations", icon: Zap },
  complete: { label: "Complete", icon: CheckCircle2 },
  error: { label: "Error", icon: AlertCircle },
};

const STAGE_ORDER = ["init", "model-meta", "context-test", "predict-test", "combination-test", "recommendation", "complete"];

// Generate a test history display based on stageProgress
/** Generate a power-of-2 context size ladder matching the benchmark's pattern. */
function generateContextSizes(total: number): number[] {
  if (total === 5) return [2048, 4096, 8192, 16384, 32768];
  const sizes: number[] = [];
  for (let i = 0, size = 1024; i < total && size <= 131072; i++, size *= 2) {
    sizes.push(size);
  }
  return sizes;
}

function TestHistoryLog({
  stage,
  stageProgress,
}: {
  stage: string;
  stageProgress: { current: number; total: number };
}) {
  const isContextTest = stage === "context-test";
  const isPredictTest = stage === "predict-test";
  const isCombinationTest = stage === "combination-test";

  const totalTests = stageProgress.total;
  const completedCount = Math.min(stageProgress.current, stageProgress.total);
  const isComplete = stageProgress.current >= stageProgress.total;

  // Determine label prefix based on stage
  const labelPrefix = isContextTest
    ? "ctx"
    : isPredictTest
    ? "predict"
    : isCombinationTest
    ? "combo"
    : "test";

  const stageIcon = isContextTest
    ? Target
    : isPredictTest
    ? TextSelect
    : isCombinationTest
    ? Combine
    : Gauge;

  // Generate test items
  const testItems: Array<{ label: string; status: "completed" | "running" | "pending" }> = [];

  for (let idx = 0; idx < totalTests; idx++) {
    let label = `${idx + 1}`;
    if (isContextTest) {
      const sizes = generateContextSizes(totalTests);
      label = `${(sizes[idx] || 0).toLocaleString()} ${labelPrefix}`;
    } else {
      label = `${labelPrefix} ${idx + 1}`;
    }

    if (idx < completedCount) {
      testItems.push({ label, status: "completed" });
    } else if (idx === completedCount && !isComplete) {
      testItems.push({ label, status: "running" });
    } else {
      testItems.push({ label, status: "pending" });
    }
  }

  return (
    <div className="mt-3 space-y-1.5 rounded-lg border border-border-default/50 bg-bg-elevated/50 p-3">
      <div className="flex items-center gap-2 text-xxs font-medium text-text-secondary">
        <span className="flex items-center gap-1">
          <Gauge className="h-3 w-3" />
          <span>Test Details</span>
        </span>
        <span className="ml-auto text-text-muted">
          {completedCount}/{totalTests}
        </span>
      </div>

      <div className="space-y-1 max-h-56 overflow-y-auto">
        {testItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xxs">
            <span className={`font-mono text-text-primary w-32 ${item.status === "completed" ? "text-status-success" : item.status === "running" ? "text-accent" : "text-text-muted"}`}>
              {item.label}
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-bg-raised">
              <div
                className={`h-full transition-all duration-300 ${
                  item.status === "completed" ? "bg-status-success" :
                  item.status === "running" ? "bg-accent animate-pulse" :
                  "bg-bg-elevated"
                }`}
                style={{ width: item.status === "completed" ? "100%" : item.status === "running" ? "50%" : "0%" }}
              />
            </div>
            <span className={`text-xxs ${item.status === "completed" ? "text-status-success" : item.status === "running" ? "text-accent" : "text-text-muted"}`}>
              {item.status === "completed" ? "✓" : item.status === "running" ? "⟳" : "○"}
            </span>
          </div>
        ))}
        
        {testItems.length === 0 && (
          <div className="text-xxs text-text-muted">Waiting for tests to start...</div>
        )}
      </div>
    </div>
  );
}

function BenchmarkProgressDisplay({ job }: BenchmarkProgressDisplayProps) {
  const currentStageIndex = job.stage ? STAGE_ORDER.indexOf(job.stage) : 0;

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border-default bg-bg-raised p-4">
      {/* Stage timeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGE_ORDER.map((stageKey, idx) => {
          const config = STAGE_LABELS[stageKey];
          if (!config) return null;
          const Icon = config.icon;
          const isCurrent = idx === currentStageIndex;
          const isComplete = idx < currentStageIndex || job.stage === "complete";
          const isFuture = idx > currentStageIndex && job.stage !== "complete";

          return (
            <div key={stageKey} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xxs whitespace-nowrap ${
                  isCurrent
                    ? "bg-accent/15 text-accent font-medium"
                    : isComplete
                    ? "bg-success/10 text-success"
                    : "bg-bg-elevated text-text-muted"
                }`}
              >
                {isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isComplete ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3 opacity-50" />
                )}
                <span>{config.label}</span>
              </div>
              {idx < STAGE_ORDER.length - 1 && (
                <div
                  className={`h-px w-3 ${
                    isComplete ? "bg-success/50" : "bg-border-default"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">
            {STAGE_LABELS[job.stage || "init"]?.label || job.stage || "Initializing..."}
          </span>
          <span className="font-medium tabular-nums text-text-primary">
            {job.progress}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Stage-specific progress (e.g. "3 of 8 sizes") */}
      {job.stageProgress && job.stageProgress.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xxs text-text-muted">
            <span>
                {job.stage === "context-test"
                  ? `Context sizes tested: ${job.stageProgress.current} / ${job.stageProgress.total}`
                  : job.stage === "predict-test"
                  ? `Predict sizes tested: ${job.stageProgress.current} / ${job.stageProgress.total}`
                  : job.stage === "combination-test"
                  ? `Combinations tested: ${job.stageProgress.current} / ${job.stageProgress.total}`
                  : `Progress: ${job.stageProgress.current} / ${job.stageProgress.total}`}
            </span>
            <span className="tabular-nums">
              {Math.round((job.stageProgress.current / job.stageProgress.total) * 100)}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-bg-elevated">
            <div
              className="h-full bg-success transition-all duration-300"
              style={{
                width: `${(job.stageProgress.current / job.stageProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Test detail log - shows individual test results */}
      {job.currentTest && job.stageProgress && job.stage && (
        <TestHistoryLog
          stage={job.stage}
          stageProgress={job.stageProgress}
        />
      )}

      {/* Detailed message */}
      {job.message && (
        <p className="text-xxs text-text-muted break-words">{job.message}</p>
      )}
    </div>
  );
}

// ============================================================================
// History Item
// ============================================================================

function HistoryItem({
  job,
  selected,
  onSelect,
  onDelete,
}: {
  job: BenchmarkJob;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const report = job.report;
  const date = new Date(job.createdAt);

  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-3 transition-colors cursor-pointer ${
        selected
          ? "border-accent/50 bg-accent/5"
          : "border-border-default bg-bg-raised hover:border-border-hover"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col items-center min-w-[2.5rem]">
          {job.status === "completed" && report ? (
            <>
              <span className="text-xs font-semibold text-status-success">
                {formatNumber(report.recommendedNumCtx)}
              </span>
              <span className="text-xxs text-text-muted">ctx</span>
            </>
          ) : job.status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          ) : job.status === "failed" ? (
            <AlertCircle className="h-4 w-4 text-status-error" />
          ) : (
            <Clock className="h-4 w-4 text-text-muted" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">
            {report?.config?.model || job.config?.model || "unknown"}
          </p>
          <p className="text-xxs text-text-muted">
            {date.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {report?.recommendedNumPredict && report.recommendedNumPredict > 0 && (
          <StatusBadge label={`predict: ${formatNumber(report.recommendedNumPredict)}`} variant="info" size="sm" />
        )}
        {report?.recommendedNumCtx && (
          <StatusBadge label={`ctx: ${formatNumber(report.recommendedNumCtx)}`} variant="info" size="sm" />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="rounded p-1 text-text-muted hover:bg-bg-overlay hover:text-status-error"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Roleplay Lore Test Results
// ============================================================================

function RoleplayResults({ result }: { result: RoleplayTestResult }) {
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);

  return (
    <div className="mt-4 space-y-4">
      {/* Score */}
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xxs text-text-muted">Lore Fidelity Score</p>
            <p className="text-xl font-bold text-text-primary">
              {(result.overallScore * 100).toFixed(0)}
              <span className="text-sm font-normal text-text-muted"> / 100</span>
            </p>
          </div>
          <div className="text-right text-xxs text-text-muted">
            <p>Recall: {(result.averageRecallRate * 100).toFixed(0)}%</p>
            <p>Format: {(result.averageFormatScore * 100).toFixed(0)}%</p>
            <p>Contradictions: {result.totalContradictions}</p>
          </div>
        </div>
      </div>

      {/* Per-turn breakdown */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
          <ScrollText className="h-3.5 w-3.5" />
          Turn Results ({result.turnsCompleted}/{result.totalTurns})
        </p>
        {result.turnResults.map((turn) => (
          <div key={turn.turn} className="rounded-lg border border-border-default bg-bg-raised overflow-hidden">
            <button
              onClick={() => setExpandedTurn(expandedTurn === turn.turn ? null : turn.turn)}
              className="flex w-full items-center justify-between p-3 text-xs hover:bg-bg-elevated/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="h-3 w-3 text-text-muted shrink-0" />
                <span className="truncate text-text-primary">
                  Turn {turn.turn}: {turn.prompt.slice(0, 60)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <StatusBadge
                  label={`${(turn.recallRate * 100).toFixed(0)}%`}
                  variant={turn.recallRate >= 0.5 ? "success" : turn.recallRate > 0 ? "warning" : "error"}
                  size="sm"
                />
                {turn.contradictionCount > 0 && (
                  <StatusBadge label={`${turn.contradictionCount} contradictions`} variant="error" size="sm" />
                )}
                {turn.error && <AlertCircle className="h-3 w-3 text-status-error" />}
              </div>
            </button>
            {expandedTurn === turn.turn && (
              <div className="border-t border-border-default p-3 space-y-2 text-xxs">
                {turn.factResults.length > 0 ? (
                  <div className="space-y-1">
                    {turn.factResults.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-0.5 ${f.recalled ? "text-status-success" : "text-status-error"}`}>
                          {f.recalled ? "✓" : "✗"}
                        </span>
                        <div>
                          <span className="text-text-primary">{f.fact}</span>
                          {f.details && <span className="text-text-muted ml-1">— {f.details}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-text-muted">No fact data available{turn.error ? `: ${turn.error}` : ""}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contradictions */}
      {result.contradictions.length > 0 && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3">
          <p className="text-xs font-medium text-status-warning mb-1">Detected Contradictions</p>
          <ul className="space-y-0.5 text-xxs text-text-secondary">
            {result.contradictions.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span>⚠</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary info */}
      <div className="grid grid-cols-2 gap-2 text-xxs text-text-muted">
        <div>
          <span className="font-medium text-text-secondary">World:</span> {result.lorePackName}
        </div>
        <div>
          <span className="font-medium text-text-secondary">Duration:</span> {formatDuration(result.durationMs)}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Results Display
// ============================================================================

function BenchmarkResults({
  report,
  onApply,
}: {
  report: BenchmarkReport;
  onApply: (numCtx: number, numPredict: number) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Recommendation */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-medium text-text-primary">Recommended Settings</h3>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xxs text-text-muted">num_ctx</p>
                <p className="text-xl font-bold text-text-primary">
                  {formatNumber(report.recommendedNumCtx)}
                </p>
              </div>
              <div className="text-text-muted text-xl">×</div>
              <div>
                <p className="text-xxs text-text-muted">num_predict</p>
                <p className="text-xl font-bold text-text-primary">
                  {formatNumber(report.recommendedNumPredict)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xxs text-text-muted">
              Best balanced {report.config.quickMode ? "quick" : "full"} benchmark combination
              with 10% safety margin.
            </p>
          </div>
          <Button onClick={() => onApply(report.recommendedNumCtx, report.recommendedNumPredict)} variant="primary" size="sm">
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Apply both
          </Button>
        </div>
      </div>

      {/* Run Configuration */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-medium text-text-primary">Run Configuration</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-xxs text-text-muted">Model</p>
            <p className="font-medium text-text-primary">{report.config.model}</p>
          </div>
          <div>
            <p className="text-xxs text-text-muted">Ollama Host</p>
            <p className="truncate font-mono text-text-secondary">{report.config.ollamaHost}</p>
          </div>
          <div>
            <p className="text-xxs text-text-muted">Mode</p>
            <StatusBadge
              label={report.config.quickMode ? "Quick" : "Full"}
              variant={report.config.quickMode ? "info" : "default"}
              size="sm"
            />
          </div>
          <div>
            <p className="text-xxs text-text-muted">Thinking</p>
            <StatusBadge
              label={
                report.config.thinkingMode === undefined
                  ? "Default"
                  : report.config.thinkingMode
                  ? "On"
                  : "Off"
              }
              variant={
                report.config.thinkingMode === undefined
                  ? "default"
                  : report.config.thinkingMode
                  ? "info"
                  : "success"
              }
              size="sm"
            />
          </div>
          <div>
            <p className="text-xxs text-text-muted">Max context tested</p>
            <StatusBadge
              label={
                report.config.maxContextSize === undefined
                  ? "128K"
                  : report.config.maxContextSize >= 1048576
                  ? "1M"
                  : report.config.maxContextSize >= 524288
                  ? "512K"
                  : report.config.maxContextSize >= 262144
                  ? "256K"
                  : report.config.maxContextSize >= 131072
                  ? "128K"
                  : `${report.config.maxContextSize}`
              }
              variant="default"
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Context Test */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-medium text-text-primary">Max Context (at 256 predict tokens)</h3>
        </div>
        <div className="mb-3 flex items-center gap-3 text-xs">
          <span className="text-text-muted">Max working:</span>
          <span className="font-semibold text-text-primary">
            {formatNumber(report.contextTest.maxContextFound)} tokens
          </span>
          {report.contextTest.oomSize && (
            <StatusBadge
              label={`OOM at ${formatNumber(report.contextTest.oomSize)}`}
              variant="warning"
              size="sm"
            />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-muted">
                <th className="py-1.5 text-left font-medium">Context</th>
                <th className="py-1.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.contextTest.testedSizes.map((s, i) => (
                <tr key={i} className="border-b border-border-default/50">
                  <td className="py-1.5 font-mono text-text-primary">
                    {formatNumber(s.size)}
                  </td>
                  <td className="py-1.5">
                    {s.success ? (
                      <span className="inline-flex items-center gap-1 text-status-success">
                        <CheckCircle2 className="h-3 w-3" />
                        OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-status-error">
                        <AlertCircle className="h-3 w-3" />
                        {s.error?.substring(0, 40) || "Failed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Predict Test */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2 mb-3">
          <TextSelect className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-medium text-text-primary">Max Predict Tokens (at 2K context)</h3>
        </div>
        <div className="mb-3 flex items-center gap-3 text-xs">
          <span className="text-text-muted">Max working:</span>
          <span className="font-semibold text-text-primary">
            {formatNumber(report.predictTest.maxPredictFound)} tokens
          </span>
          {report.predictTest.oomSize && (
            <StatusBadge
              label={`OOM at ${formatNumber(report.predictTest.oomSize)}`}
              variant="warning"
              size="sm"
            />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-muted">
                <th className="py-1.5 text-left font-medium">Num Predict</th>
                <th className="py-1.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.predictTest.testedSizes.map((s, i) => (
                <tr key={i} className="border-b border-border-default/50">
                  <td className="py-1.5 font-mono text-text-primary">
                    {formatNumber(s.size)}
                  </td>
                  <td className="py-1.5">
                    {s.success ? (
                      <span className="inline-flex items-center gap-1 text-status-success">
                        <CheckCircle2 className="h-3 w-3" />
                        OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-status-error">
                        <AlertCircle className="h-3 w-3" />
                        {s.error?.substring(0, 40) || "Failed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Combination Grid */}
      {report.combinations.length > 0 && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <Combine className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-medium text-text-primary">Context × Predict Combinations</h3>
          </div>
          <p className="text-xxs text-text-muted mb-3">
            For each working context size, shows the maximum num_predict that works alongside it.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-default text-text-muted">
                  <th className="py-1.5 text-left font-medium">Context</th>
                  <th className="py-1.5 text-right font-medium">Max Predict</th>
                  <th className="py-1.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.combinations.map((c, i) => (
                  <tr key={i} className={`border-b border-border-default/50 ${c.contextSize === report.recommendedNumCtx ? 'bg-accent/5' : ''}`}>
                    <td className="py-1.5 font-mono text-text-primary">
                      {formatNumber(c.contextSize)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-primary">
                      {c.success ? formatNumber(c.maxNumPredict) : "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      {c.success ? (
                        <span className="text-status-success">OK</span>
                      ) : (
                        <span className="text-status-error">Failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xxs text-text-muted">
            Highlighted row = recommended combination.
          </p>
        </div>
      )}

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-status-warning" />
            <h3 className="text-sm font-medium text-text-primary">Warnings</h3>
          </div>
          <ul className="space-y-1 text-xs text-text-secondary">
            {report.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-status-warning">•</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
