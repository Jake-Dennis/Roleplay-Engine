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
  Cpu,
  MemoryStick,
  Zap,
  Target,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Brain,
  Ruler,
  Sparkles,
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

interface HardwareInfo {
  cpu: { model: string; cores: number; threads: number };
  memory: { totalBytes: number; availableBytes: number };
  gpu?: { name: string; vramBytes: number }[];
  platform: string;
  arch: string;
}

interface ThroughputResult {
  contextSize: number;
  generationTokensPerSec: number;
  embeddingTokensPerSec: number;
  firstTokenLatencyMs: number;
  durationMs: number;
}

interface NeedleTestResult {
  contextSize: number;
  needleDepthPercent: number;
  retrieved: boolean;
  similarityScore: number;
  durationMs: number;
}

interface MultiTurnTestResult {
  contextSize: number;
  turns: number;
  entityConsistencyScore: number;
  factualDriftScore: number;
  durationMs: number;
}

interface SummarizationFidelityResult {
  originalTokens: number;
  summaryTokens: number;
  compressionRatio: number;
  fidelityScore: number;
  durationMs: number;
}

interface MemoryRetentionResult {
  needleTests: NeedleTestResult[];
  multiTurnTests: MultiTurnTestResult[];
  summarizationTests: SummarizationFidelityResult[];
  overallScore: number;
}

interface ContextTestResult {
  success: boolean;
  maxContextFound: number;
  testedSizes: { size: number; success: boolean; error?: string }[];
  oomSize?: number;
  durationMs: number;
}

interface BenchmarkReport {
  timestamp: string;
  config: {
    model: string;
    ollamaHost: string;
    testContextSizes: number[];
    quickMode: boolean;
    retentionTestTurns?: number;
    needleDepthPercent?: number;
    thinkingMode?: boolean;
    maxContextSize?: number;
  };
  hardware?: HardwareInfo;
  modelMeta: {
    name: string;
    contextLength: number;
    parameterSize: string;
    quantizationLevel: string;
    family: string;
  };
  contextTest: ContextTestResult;
  throughputTests: ThroughputResult[];
  memoryRetention: MemoryRetentionResult;
  overallScore: number;
  recommendedNumCtx: number;
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
  report?: BenchmarkReport;
  error?: string;
  timestamp: string;
  model: string;
}

// ============================================================================
// Utility
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDuration(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function scoreColor(score: number): "success" | "warning" | "error" | "info" {
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "warning";
  if (score > 0) return "error";
  return "info";
}

function score100Color(score: number): "success" | "warning" | "error" | "info" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  if (score > 0) return "error";
  return "info";
}

// ============================================================================
// Page Component
// ============================================================================

export default function BenchmarkPage() {
  // Run state
  const [quickMode, setQuickMode] = useState(true);
  const [thinkingMode, setThinkingMode] = useState<boolean>(false);
  const [maxContextSize, setMaxContextSize] = useState<number>(131072);
  const [model, setModel] = useState("");
  const [availableModels, setAvailableModels] = useState<OllamaModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<BenchmarkJob | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState("");

  // History
  const [history, setHistory] = useState<BenchmarkJob[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Selected report (for viewing past results)
  const [selectedJob, setSelectedJob] = useState<BenchmarkJob | null>(null);

  // Polling ref
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchHistory();
    fetchUserSettings();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchUserSettings = async () => {
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
  };

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

  const fetchHistory = async () => {
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
  };

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
  }, []);

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

  const applyAutoTune = async (numCtx: number) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ numCtx }),
      });
      if (res.ok) {
        alert(`Applied: numCtx = ${numCtx.toLocaleString()}`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to apply: ${err.error || "Unknown error"}`);
      }
    } catch (e: unknown) {
      const err = e as Error;
      alert(`Failed to apply: ${err.message}`);
    }
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
          Test your hardware, find the maximum context window, measure throughput, and check memory retention.
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
              <span>Quick mode (fewer tests, ~60s)</span>
            </label>
            <p className="mt-1 text-xxs text-text-muted">
              {quickMode
                ? "Tests 2K, 4K, 8K, 16K, 32K contexts. Fewer memory tests. Good for a quick sanity check (~60s)."
                : "Tests 1K through 128K in power-of-2 steps (8 sizes). Full memory retention suite. May take 5+ minutes."}
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
  "model-meta": { label: "Fetching model info", icon: Cpu },
  "context-test": { label: "Context window test", icon: Target },
  "throughput-test": { label: "Throughput test", icon: Gauge },
  "memory-retention": { label: "Memory retention", icon: Brain },
  "auto-tune": { label: "Auto-tuning", icon: Zap },
  complete: { label: "Complete", icon: CheckCircle2 },
  error: { label: "Error", icon: AlertCircle },
};

const STAGE_ORDER = ["init", "model-meta", "context-test", "throughput-test", "memory-retention", "auto-tune", "complete"];

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
  const isThroughputTest = stage === "throughput-test";
  const isMemoryTest = stage === "memory-retention";

  // Generate test items based on progress - show what we know
  const totalTests = stageProgress.total;
  const completedCount = Math.min(stageProgress.current, stageProgress.total);
  const isComplete = stageProgress.current >= stageProgress.total;

  // Generate test items based on stage type
  const testItems: Array<{ label: string; status: "completed" | "running" | "pending" }> = [];

  if (isContextTest || isThroughputTest) {
    // Show context sizes - compute dynamically from total count
    const sizes = generateContextSizes(totalTests);
    sizes.forEach((size, idx) => {
      if (idx < completedCount) {
        testItems.push({ label: `${size.toLocaleString()} ctx`, status: "completed" });
      } else if (idx === completedCount && !isComplete) {
        testItems.push({ label: `${size.toLocaleString()} ctx`, status: "running" });
      } else if (idx >= completedCount) {
        testItems.push({ label: `${size.toLocaleString()} ctx`, status: "pending" });
      }
    });
  } else if (isMemoryTest) {
    // Memory test: show test types
    const memoryTests = ["Needle", "Multi-turn", "Summarization"];
    memoryTests.forEach((name, idx) => {
      // Each test type runs for multiple context sizes, so we estimate
      const testIndex = Math.floor(idx * totalTests / 3);
      if (testIndex < completedCount) {
        testItems.push({ label: name, status: "completed" });
      } else if (testIndex === completedCount && !isComplete) {
        testItems.push({ label: name, status: "running" });
      } else {
        testItems.push({ label: name, status: "pending" });
      }
    });
  }

  // Debug: always show what we're receiving
  const debugInfo = {
    stage,
    totalTests,
    completedCount,
    isComplete,
    hasData: totalTests > 0,
  };

  return (
    <div className="mt-3 space-y-1.5 rounded-lg border border-border-default/50 bg-bg-elevated/50 p-3">
      <div className="flex items-center gap-2 text-xxs font-medium text-text-secondary">
        <span className="flex items-center gap-1">
          {stage === "context-test" && <Target className="h-3 w-3" />}
          {stage === "throughput-test" && <Gauge className="h-3 w-3" />}
          {stage === "memory-retention" && <Brain className="h-3 w-3" />}
          <span>Test Details</span>
        </span>
        <span className="ml-auto text-text-muted">
          {completedCount}/{totalTests}
        </span>
      </div>

      {/* Debug panel - shows raw data */}
      <details className="text-xxs text-text-muted">
        <summary>Debug: stageProgress data</summary>
        <pre className="mt-1 p-2 bg-bg-raised rounded text-[10px] overflow-auto">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </details>

      <div className="space-y-1 max-h-56 overflow-y-auto">
        {testItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xxs">
            <span className={`font-mono text-text-primary w-28 ${item.status === "completed" ? "text-status-success" : item.status === "running" ? "text-accent" : "text-text-muted"}`}>
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
                : job.stage === "throughput-test"
                ? `Sizes measured: ${job.stageProgress.current} / ${job.stageProgress.total}`
                : job.stage === "memory-retention"
                ? `Tests run: ${job.stageProgress.current} / ${job.stageProgress.total}`
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
  const score = job.report?.overallScore ?? null;
  const date = new Date(job.timestamp);
  const scoreBadge = score !== null ? score100Color(score / 100) : "info";

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
        <div className="flex flex-col items-center">
          {job.status === "completed" && score !== null && (
            <span className={`text-sm font-semibold ${
              score >= 80 ? "text-status-success" : score >= 50 ? "text-status-warning" : "text-status-error"
            }`}>
              {score.toFixed(0)}
            </span>
          )}
          {job.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
          {job.status === "failed" && <AlertCircle className="h-4 w-4 text-status-error" />}
          {job.status === "queued" && <Clock className="h-4 w-4 text-text-muted" />}
          <span className="text-xxs text-text-muted">/100</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">
            {job.model || job.report?.config.model || "unknown"}
          </p>
          <p className="text-xxs text-text-muted">
            {date.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {job.report?.recommendedNumCtx && (
          <StatusBadge label={`ctx: ${formatNumber(job.report.recommendedNumCtx)}`} variant="info" size="sm" />
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
// Results Display
// ============================================================================

function BenchmarkResults({
  report,
  onApply,
}: {
  report: BenchmarkReport;
  onApply: (numCtx: number) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Score Card */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xxs text-text-muted">Overall Score</p>
            <p className="text-3xl font-bold text-text-primary">
              {report.overallScore.toFixed(1)}
              <span className="text-base font-normal text-text-muted"> / 100</span>
            </p>
          </div>
          <StatusBadge
            label={
              report.overallScore >= 80
                ? "Excellent"
                : report.overallScore >= 60
                ? "Good"
                : report.overallScore >= 40
                ? "Fair"
                : "Poor"
            }
            variant={score100Color(report.overallScore)}
            size="md"
          />
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
        {report.config.thinkingMode === true && (
          <p className="mt-3 text-xxs text-warning">
            ⚠ Run used thinking mode — generation time and token counts include reasoning tokens.
          </p>
        )}
      </div>

      {/* Auto-tune Recommendation */}
      {report.recommendedNumCtx > 0 && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-medium text-text-primary">Auto-tune Recommendation</h3>
              </div>
              <p className="text-xs text-text-secondary">
                Recommended <code className="text-accent">numCtx</code>:{" "}
                <span className="font-semibold text-text-primary">
                  {formatNumber(report.recommendedNumCtx)}
                </span>{" "}
                tokens
              </p>
              <p className="mt-1 text-xxs text-text-muted">
                Optimized for your hardware, with safety margin for stability.
              </p>
            </div>
            <Button onClick={() => onApply(report.recommendedNumCtx)} variant="primary" size="sm">
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Hardware Info */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-medium text-text-primary">Hardware</h3>
        </div>
        {(() => {
          const hw = report.hardware;
          if (!hw) {
            return (
              <div className="text-center py-4 text-text-muted">
                <p className="text-sm">Hardware detection skipped</p>
                <p className="text-xxs mt-1">Run with hardware detection enabled to see details</p>
              </div>
            );
          }
          return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <HardwareCard
                icon={Cpu}
                label="CPU"
                value={hw.cpu.model}
                sub={`${hw.cpu.cores} cores / ${hw.cpu.threads} threads`}
              />
              <HardwareCard
                icon={MemoryStick}
                label="RAM"
                value={formatBytes(hw.memory.totalBytes)}
                sub={`${formatBytes(hw.memory.availableBytes)} available`}
              />
              {hw.gpu && hw.gpu.length > 0 ? (
                hw.gpu.map((g, i) => (
                  <HardwareCard
                    key={i}
                    icon={Zap}
                    label={`GPU${hw.gpu!.length > 1 ? ` ${i + 1}` : ""}`}
                    value={g.name}
                    sub={`${formatBytes(g.vramBytes)} VRAM`}
                  />
                ))
              ) : (
                <HardwareCard
                  icon={Zap}
                  label="GPU"
                  value="Not detected"
                  sub="No NVIDIA GPU or nvidia-smi missing"
                />
              )}
            </div>
          );
        })()}
      </div>

      {/* Context Test */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-medium text-text-primary">Context Window Test</h3>
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
                <th className="py-1.5 text-left font-medium">Duration</th>
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
                  <td className="py-1.5 text-text-muted">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Throughput */}
      {report.throughputTests.length > 0 && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-medium text-text-primary">Throughput</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-default text-text-muted">
                  <th className="py-1.5 text-left font-medium">Context</th>
                  <th className="py-1.5 text-right font-medium">Gen tok/s</th>
                  <th className="py-1.5 text-right font-medium">Embed tok/s</th>
                  <th className="py-1.5 text-right font-medium">First Token</th>
                </tr>
              </thead>
              <tbody>
                {report.throughputTests.map((t, i) => (
                  <tr key={i} className="border-b border-border-default/50">
                    <td className="py-1.5 font-mono text-text-primary">
                      {formatNumber(t.contextSize)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-primary">
                      {t.generationTokensPerSec.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-muted">
                      {t.embeddingTokensPerSec.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-text-muted">
                      {t.firstTokenLatencyMs.toFixed(0)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Memory Retention */}
      <MemoryRetentionSection retention={report.memoryRetention} />

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

// ============================================================================
// Hardware Card
// ============================================================================

function HardwareCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-raised p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-text-muted" />
        <p className="text-xxs text-text-muted">{label}</p>
      </div>
      <p className="text-sm font-medium text-text-primary truncate" title={value}>
        {value}
      </p>
      {sub && <p className="text-xxs text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ============================================================================
// Memory Retention Section
// ============================================================================

function MemoryRetentionSection({ retention }: { retention: MemoryRetentionResult }) {
  const [expanded, setExpanded] = useState(false);
  const score = retention.overallScore;

  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <MemoryStick className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-medium text-text-primary">Memory Retention</h3>
          <StatusBadge
            label={`${(score * 100).toFixed(0)}%`}
            variant={scoreColor(score)}
            size="sm"
          />
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {retention.needleTests.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-text-secondary mb-2">
                Needle in Haystack
              </h4>
              <div className="space-y-1.5">
                {retention.needleTests.map((n, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">
                      {formatNumber(n.contextSize)} ctx @ {(n.needleDepthPercent * 100).toFixed(0)}% depth
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-raised">
                        <div
                          className={`h-full ${
                            n.similarityScore >= 0.8
                              ? "bg-status-success"
                              : n.similarityScore >= 0.5
                              ? "bg-status-warning"
                              : "bg-status-error"
                          }`}
                          style={{ width: `${n.similarityScore * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-text-primary w-12 text-right">
                        {(n.similarityScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {retention.multiTurnTests.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-text-secondary mb-2">
                Multi-turn Consistency
              </h4>
              <div className="space-y-1.5">
                {retention.multiTurnTests.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">
                      {formatNumber(m.contextSize)} ctx, {m.turns} turns
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-status-success">
                        {(m.entityConsistencyScore * 100).toFixed(0)}% consistent
                      </span>
                      <span className="font-mono text-text-muted">
                        {(m.factualDriftScore * 100).toFixed(0)}% drift
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {retention.summarizationTests.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-text-secondary mb-2">
                Summarization Fidelity
              </h4>
              <div className="space-y-1.5">
                {retention.summarizationTests.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">
                      {formatNumber(s.originalTokens)} → {formatNumber(s.summaryTokens)} tokens
                      ({(1 / s.compressionRatio).toFixed(1)}:1)
                    </span>
                    <span className="font-mono text-text-primary">
                      {(s.fidelityScore * 100).toFixed(0)}% fidelity
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
