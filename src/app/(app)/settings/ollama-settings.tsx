"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Sparkles, Check, AlertCircle, RefreshCw, Save, Link, Gauge, Zap, TrendingUp, ExternalLink, Brain, Sliders, Briefcase } from "lucide-react";

interface OllamaModel {
  name: string;
  parameterSize: string;
  family: string;
}

interface BenchmarkStatus {
  recommendedNumCtx: number;
  recommendedNumPredict: number;
  timestamp: string;
  jobId: string;
}

interface ServerSettings {
  ollama: {
    host: string;
    model: string;
    embeddingModel: string;
  };
  tts: {
    host: string;
    defaultVoice: string;
  };
  user?: {
    llmModel: string;
    embeddingModel: string;
    numCtx?: number;
    ollamaUrl?: string;
    ttsUrl?: string;
  };
}

function formatContextWindow(value: number): string {
  if (value >= 1000000) return `${(value / 1000).toFixed(0)}K (${(value / 1000000).toFixed(1)}M)`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return String(value);
}

interface OllamaSettingsProps {
  // State
  ollamaConnected: boolean;
  models: OllamaModel[];
  localModels: string[];
  selectedLLM: string;
  setSelectedLLM: (v: string) => void;
  selectedEmbedding: string;
  setSelectedEmbedding: (v: string) => void;
  selectedNumCtx: number;
  setSelectedNumCtx: (v: number) => void;
  ollamaUrl: string;
  setOllamaUrl: (v: string) => void;
  thinkingMode: boolean;
  onThinkingModeChange: (v: boolean) => void;
  modelLoading: boolean;
  modelSaving: boolean;
  modelSaved: boolean;
  modelError: string;
  settings: ServerSettings | null;
  // Generation defaults
  useCustomSampling: boolean;
  onUseCustomSamplingChange: (v: boolean) => void;
  temperature: number;
  setTemperature: (v: number) => void;
  topP: number;
  setTopP: (v: number) => void;
  topK: number;
  setTopK: (v: number) => void;
  numPredict: number;
  setNumPredict: (v: number) => void;
  defaultsSaving: boolean;
  defaultsSaved: boolean;
  defaultsError: string;
  onSaveDefaults: () => Promise<void>;
  // Handlers
  handleRefreshModels: () => Promise<void>;
  handleModelSave: () => Promise<void>;
  /**
   * Combined save for the "Apply" button next to Context Window. Pushes
   * BOTH the recommended numCtx AND the recommended num_predict into
   * the active model's per-model override slot in a single PUT.
   */
  onApplyAutoTune: () => Promise<void>;
  // Jobs model (separate model for background jobs like summarization, wiki enrichment, NPC evolution)
  useJobsModel: boolean;
  onUseJobsModelChange: (v: boolean) => void;
  jobModel: string;
  setJobModel: (v: string) => void;
  jobsModelSaving: boolean;
  jobsModelSaved: boolean;
  jobsModelError: string;
  onSaveJobsModel: () => Promise<void>;
  // Per-model overrides
  hasModelOverrides: boolean;
  onResetModelOverrides: () => void;
}

export function OllamaSettingsSection({
  ollamaConnected,
  models,
  localModels,
  selectedLLM,
  setSelectedLLM,
  selectedEmbedding,
  setSelectedEmbedding,
  selectedNumCtx,
  setSelectedNumCtx,
  ollamaUrl,
  setOllamaUrl,
  thinkingMode,
  onThinkingModeChange,
  modelLoading,
  modelSaving,
  modelSaved,
  modelError,
  settings,
  useCustomSampling,
  onUseCustomSamplingChange,
  temperature,
  setTemperature,
  topP,
  setTopP,
  topK,
  setTopK,
  numPredict,
  setNumPredict,
  defaultsSaving,
  defaultsSaved,
  defaultsError,
  onSaveDefaults,
  handleRefreshModels,
  handleModelSave,
  hasModelOverrides,
  onResetModelOverrides,
  onApplyAutoTune,
  useJobsModel,
  onUseJobsModelChange,
  jobModel,
  setJobModel,
  jobsModelSaving,
  jobsModelSaved,
  jobsModelError,
  onSaveJobsModel,
}: OllamaSettingsProps) {
  const router = useRouter();
  const [benchmarkStatus, setBenchmarkStatus] = useState<BenchmarkStatus | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  function isModelLocallyAvailable(modelName: string): boolean {
    if (localModels.length === 0) return true; // Unknown state, assume available
    return localModels.includes(modelName) || localModels.some(m => m.startsWith(modelName + ":"));
  }

  // Fetch latest benchmark for current model
  async function fetchBenchmarkStatus(model: string, signal?: AbortSignal) {
    if (!model) {
      setBenchmarkStatus(null);
      return;
    }
    setBenchmarkLoading(true);
    try {
      const response = await fetch(`/api/benchmark?model=${encodeURIComponent(model)}&limit=1`, { signal });
      if (response.ok) {
        const data = await response.json();
        if (data.benchmarks && data.benchmarks.length > 0) {
          const latest = data.benchmarks[0];
          if (latest.status === "completed" && latest.report) {
            setBenchmarkStatus({
              recommendedNumCtx: latest.report.recommendedNumCtx,
              recommendedNumPredict: latest.report.recommendedNumPredict,
              timestamp: latest.completedAt || latest.updatedAt,
              jobId: latest.jobId,
            });
          } else if (latest.status === "running" || latest.status === "queued") {
            setBenchmarkRunning(true);
            setBenchmarkStatus(null);
          } else {
            setBenchmarkStatus(null);
          }
        } else {
          setBenchmarkStatus(null);
        }
      } else {
        setBenchmarkStatus(null);
      }
    } catch {
      if (!(signal?.aborted)) {
        setBenchmarkStatus(null);
      }
    } finally {
      if (!(signal?.aborted)) {
        setBenchmarkLoading(false);
      }
    }
  }

  // Check for running benchmark on mount
  useEffect(() => {
    if (selectedLLM) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch with setState in callback is intentional
      fetchBenchmarkStatus(selectedLLM);
    }
  }, [selectedLLM]);

  // Auto-tune check: show the "Apply" hint whenever the current Context
  // Window OR Max Predict Tokens differs from the benchmark recommendation.
  // Clicking Apply will push BOTH recommended values to the active model's
  // per-model override slot in a single save.
  const numPredictDiffers =
    benchmarkStatus && benchmarkStatus.recommendedNumPredict !== numPredict;
  const numCtxDiffers =
    benchmarkStatus && benchmarkStatus.recommendedNumCtx !== selectedNumCtx;
  const showAutoTune = benchmarkStatus && (numCtxDiffers || numPredictDiffers);

  async function handleRunBenchmark() {
    if (benchmarkRunning) return;
    setBenchmarkRunning(true);
    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedLLM, quickMode: true }),
      });
      if (response.ok) {
        // Navigate to benchmark page to show progress
        router.push("/settings/benchmark");
      }
    } catch {
      // Error handled silently - user will see on benchmark page
    } finally {
      setBenchmarkRunning(false);
    }
  }

  async function handleApplyAutoTune() {
    if (!benchmarkStatus) return;
    // Push BOTH recommended values into the active model's per-model
    // override slot in a single save. The parent passes a combined
    // handler that writes numCtx + numPredict to modelDefaults[selectedLLM]
    // in one PUT request.
    setSelectedNumCtx(benchmarkStatus.recommendedNumCtx);
    setNumPredict(benchmarkStatus.recommendedNumPredict);
    await onApplyAutoTune();
  }

  function formatTimestamp(ts: string): string {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Cpu className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Model Selection</h2>
        </div>
      </div>

      {/* Connection status */}
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-xs ${
        ollamaConnected
          ? "bg-success/10 text-success"
          : "bg-error/10 text-error"
      }`}>
        {ollamaConnected ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" />
        )}
        {ollamaConnected ? "Connected to Ollama" : "Not connected"}
        {settings?.user?.ollamaUrl && ollamaConnected && (
          <span className="text-text-muted ml-auto">{settings.user.ollamaUrl}</span>
        )}
      </div>

      {modelError && (
        <div className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 mb-4 text-xs text-error">
          <AlertCircle className="h-3.5 w-3.5" />
          {modelError}
        </div>
      )}

      <div className="space-y-4">
        {/* Ollama URL */}
        <div>
          <label className="mb-1.5 block text-xs text-text-secondary">
            Ollama URL
            <span className="text-text-muted ml-1">(host:port)</span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="e.g. 192.168.4.2:11434"
                className="w-full rounded-lg border border-border-default bg-bg-raised pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRefreshModels}
                disabled={modelLoading || !ollamaUrl}
                className="flex items-center gap-1.5 rounded-lg bg-bg-raised border border-border-default px-3 py-2 text-xs text-text-primary hover:text-text-primary disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${modelLoading ? "animate-spin" : ""}`} />
                Detect
              </button>
              <button
                onClick={handleRunBenchmark}
                disabled={modelLoading || !ollamaUrl || !selectedLLM || benchmarkRunning}
                className="flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/20 px-3 py-2 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
                title="Run quick benchmark for current model"
              >
                <Gauge className={`h-3.5 w-3.5 ${benchmarkRunning ? "animate-spin" : ""}`} />
                {benchmarkRunning ? "Running..." : "Benchmark"}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xxs text-text-muted">
            Enter your Ollama server address. Models are detected automatically.
          </p>
        </div>

        {modelLoading ? (
          <div className="flex items-center gap-2 text-text-muted py-2">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span className="text-xs">Detecting models from {ollamaUrl}...</span>
          </div>
        ) : models.length > 0 ? (
          <>
            {/* LLM Model */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="mb-0 text-xs text-text-secondary">
                  LLM Model
                  <span className="text-text-muted ml-1">(text generation)</span>
                </label>
                {benchmarkLoading && selectedLLM && (
                  <div className="flex items-center gap-1 text-xxs text-text-muted">
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    <span>Loading benchmark...</span>
                  </div>
                )}
                {benchmarkStatus && !benchmarkLoading && (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xxs font-medium border border-accent/30 text-accent"
                      title={`Last benchmark: ctx=${formatContextWindow(benchmarkStatus.recommendedNumCtx)}, predict=${formatContextWindow(benchmarkStatus.recommendedNumPredict)} (${formatTimestamp(benchmarkStatus.timestamp)})`}
                    >
                      <TrendingUp className="h-2.5 w-2.5" />
                      <span>{formatContextWindow(benchmarkStatus.recommendedNumCtx)} ctx</span>
                    </span>
                    <button
                      onClick={() => router.push(`/settings/benchmark?job=${benchmarkStatus.jobId}`)}
                      className="text-xxs text-accent hover:underline flex items-center gap-1"
                      title="View benchmark details"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      View
                    </button>
                  </div>
                )}
                {hasModelOverrides && (
                  <span
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xxs font-medium border border-accent/30 text-accent"
                    title="This model has per-model overrides for generation params. Click 'Reset to global' below to clear them."
                  >
                    <Sliders className="h-2.5 w-2.5" />
                    <span>Customized</span>
                  </span>
                )}
              </div>
              <select
                value={selectedLLM}
                onChange={(e) => setSelectedLLM(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                {models.length === 0 && (
                  <option value="">No models detected</option>
                )}
                {models.map((m) => {
                  const isLocal = isModelLocallyAvailable(m.name);
                  return (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.parameterSize}, {m.family}) {isLocal ? "\u2713" : "\u26A0 not local"}
                    </option>
                  );
                })}
              </select>
              {selectedLLM && !isModelLocallyAvailable(selectedLLM) && (
                <p className="mt-1 text-xxs text-warning">
                  This model may not be available locally. Pull it with: ollama pull {selectedLLM}
                </p>
              )}
            </div>

            {/* Embedding Model — shows ALL models, user picks what works */}
            <div>
              <label className="mb-1.5 block text-xs text-text-secondary">
                Embedding Model
                <span className="text-text-muted ml-1">(vector search — shown all models)</span>
              </label>
              <select
                value={selectedEmbedding}
                onChange={(e) => setSelectedEmbedding(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                {models.length === 0 && (
                  <option value="">No models detected</option>
                )}
                {models.map((m) => {
                  const isLocal = isModelLocallyAvailable(m.name);
                  return (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.parameterSize}, {m.family}) {isLocal ? "\u2713" : "\u26A0 not local"}
                    </option>
                  );
                })}
              </select>
              {selectedEmbedding && !isModelLocallyAvailable(selectedEmbedding) && (
                <p className="mt-1 text-xxs text-warning">
                  This model may not be available locally. Pull it with: ollama pull {selectedEmbedding}
                </p>
              )}
            </div>

            {/* Thinking Mode */}
            <div>
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinkingMode}
                  onChange={(e) => onThinkingModeChange(e.target.checked)}
                  className="rounded border-border-default"
                />
                <Brain className="h-3.5 w-3.5 text-text-muted" />
                <span>Thinking mode</span>
              </label>
              <p className="mt-1 text-xxs text-text-muted">
                When enabled, models with reasoning capabilities (e.g. Qwen3) will
                use reasoning tokens in their responses.
              </p>
            </div>
          </>
        ) : null}

        {/* Context Window Slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="mb-0 text-xs text-text-secondary">
              Context Window
              <span className="text-text-muted ml-1">(num_ctx — higher uses more VRAM)</span>
            </label>
            {showAutoTune && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-lg bg-accent/10 border border-accent/20 px-2 py-1 text-xxs text-accent">
                  <Zap className="h-3 w-3" />
                  Benchmark recommends
                  {numCtxDiffers && (
                    <>
                      {" "}ctx {formatContextWindow(selectedNumCtx)} → {formatContextWindow(benchmarkStatus!.recommendedNumCtx)}
                    </>
                  )}
                  {numCtxDiffers && numPredictDiffers && " · "}
                  {numPredictDiffers && (
                    <>
                      predict {numPredict} → {benchmarkStatus!.recommendedNumPredict}
                    </>
                  )}
                </span>
                <button
                  onClick={handleApplyAutoTune}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xxs font-medium text-white hover:bg-accent-hover"
                  title={
                    numCtxDiffers && numPredictDiffers
                      ? "Apply both recommended num_ctx and num_predict to this model"
                      : numCtxDiffers
                        ? "Apply recommended num_ctx to this model"
                        : "Apply recommended num_predict to this model"
                  }
                >
                  <Check className="h-3 w-3" />
                  {numCtxDiffers && numPredictDiffers ? "Apply both" : "Apply"}
                </button>
              </div>
            )}
          </div>
          <input
            type="number"
            min="4096"
            max="1000000"
            step="4096"
            value={selectedNumCtx}
            onChange={(e) => setSelectedNumCtx(parseInt(e.target.value, 10) || 4096)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleModelSave}
          disabled={modelSaving || !selectedLLM || !selectedEmbedding}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {modelSaving ? (
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save Models
        </button>

        {modelSaved && (
          <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Model settings saved
          </div>
        )}
      </div>

      {/* Jobs Model */}
      <div className="mt-6 space-y-4 border-t border-border-default pt-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-medium text-text-primary">Jobs Model</h3>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={useJobsModel}
            onChange={(e) => onUseJobsModelChange(e.target.checked)}
            className="rounded border-border-default"
          />
          <span>Use a different model for background jobs</span>
        </label>
        <p className="-mt-2 text-xxs text-text-muted">
          When enabled, background processing (summarization, wiki enrichment, NPC evolution, etc.) uses the chosen model instead of the chat LLM. Per-model settings from Generation Defaults apply automatically to the jobs model.
        </p>
        {useJobsModel && (
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">
              Jobs model
              <span className="text-text-muted ml-1">(background processing)</span>
            </label>
            <select
              value={jobModel}
              onChange={(e) => setJobModel(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
            >
              {models.length === 0 && (
                <option value="">No models detected</option>
              )}
              {models.map((m) => {
                const isLocal = isModelLocallyAvailable(m.name);
                return (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.parameterSize}, {m.family}) {isLocal ? "\u2713" : "\u26A0 not local"}
                  </option>
                );
              })}
            </select>
            {jobModel && !isModelLocallyAvailable(jobModel) && (
              <p className="mt-1 text-xxs text-warning">
                This model may not be available locally. Pull it with: ollama pull {jobModel}
              </p>
            )}
          </div>
        )}
        {jobsModelError && (
          <div className="flex items-center gap-2 text-xs text-error">
            <AlertCircle className="h-3 w-3" />
            {jobsModelError}
          </div>
        )}
        <button
          onClick={onSaveJobsModel}
          disabled={jobsModelSaving || (useJobsModel && !jobModel)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {jobsModelSaving ? (
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save Jobs Model
        </button>
        {jobsModelSaved && (
          <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Jobs model saved
          </div>
        )}
      </div>

      {/* Generation Defaults */}
      <div className="mt-6 space-y-4 border-t border-border-default pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-medium text-text-primary">Generation Defaults</h3>
            {selectedLLM && (
              <span className="text-xxs text-text-muted">for <span className="text-text-secondary font-mono">{selectedLLM}</span></span>
            )}
          </div>
          {hasModelOverrides && (
            <button
              onClick={onResetModelOverrides}
              className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-2 py-1 text-xxs text-text-secondary hover:text-error hover:border-error transition-colors"
              title="Remove all per-model overrides for the selected model — generation will use the global defaults"
            >
              Reset to global
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={useCustomSampling}
            onChange={(e) => onUseCustomSamplingChange(e.target.checked)}
            className="rounded border-border-default"
          />
          <span>Use custom sampling parameters</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xxs text-text-muted">Temperature</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xxs text-text-muted">Top P</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xxs text-text-muted">Top K</label>
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xxs text-text-muted">Max Predict Tokens</label>
              {benchmarkStatus && benchmarkStatus.recommendedNumPredict > 0 && benchmarkStatus.recommendedNumPredict !== numPredict && (
                <span className="text-xxs text-accent/80" title={`Benchmark recommends ${benchmarkStatus.recommendedNumPredict.toLocaleString()} predict tokens`}>
                  Benchmark recommends: {benchmarkStatus.recommendedNumPredict.toLocaleString()}
                </span>
              )}
            </div>
            <input
              type="number"
              value={numPredict}
              onChange={(e) => setNumPredict(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
            />
          </div>
        </div>

        {defaultsError && (
          <div className="flex items-center gap-2 text-xs text-error">
            <AlertCircle className="h-3 w-3" />
            {defaultsError}
          </div>
        )}

        <button
          onClick={onSaveDefaults}
          disabled={defaultsSaving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {defaultsSaving ? (
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save Generation Defaults
        </button>

        {defaultsSaved && (
          <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Defaults saved
          </div>
        )}
      </div>
    </div>
  );
}
