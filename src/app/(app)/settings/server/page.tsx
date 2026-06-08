"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Gauge } from "lucide-react";
import Link from "next/link";
import { OllamaSettingsSection } from "../ollama-settings";
import { TTSSettingsSection } from "../tts-settings";
import { ConnectionStatusSection } from "@/components/settings/connection-status-section";
import { NarratorVoiceSection } from "@/components/settings/narrator-voice-section";
import { TIMEOUTS } from "@/lib/config";

interface ServerSettings {
  ollama: { host: string; port?: number; model: string; embeddingModel: string; thinkingMode: boolean; localModels?: string[] };
  tts: { host: string; port?: number; defaultVoice: string };
  defaults?: {
    ttsSpeed: number; ttsVolume: number; ttsFormat: string;
    ttsAutoPlay: boolean; ttsSkipLong: boolean; ttsLongThreshold: number;
  };
  /**
   * Per-model overrides for generation params. Keyed by model name.
   * When a model has overrides, those values are used at generation
   * time. Empty when no model has been customized.
   */
  modelDefaults?: Record<string, ModelSettings>;
}

interface OllamaModel { name: string; parameterSize: string; family: string }
interface TTSCacheStats {
  totalEntries: number; totalDurationMs: number; totalUses: number;
  oldestEntry: string | null; lastUsed: string | null;
  diskSize: number; diskSizeFormatted: string; fileCount: number;
}

interface ModelSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  numPredict?: number;
  numCtx?: number;
}

export default function ServerSettingsPage() {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Model
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [selectedLLM, setSelectedLLM] = useState("");
  const [selectedEmbedding, setSelectedEmbedding] = useState("");
  const [selectedNumCtx, setSelectedNumCtx] = useState(16384);
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [modelLoading, setModelLoading] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [modelError, setModelError] = useState("");

  // Thinking mode
  const [thinkingMode, setThinkingMode] = useState(false);

  // Generation defaults
  const [useCustomSampling, setUseCustomSampling] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(64);
  const [numPredict, setNumPredict] = useState(4096);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const [defaultsError, setDefaultsError] = useState("");

  // Jobs model (separate LLM for background jobs). When `useJobsModel`
  // is true, jobs use `jobModel` instead of the chat LLM. Per-model
  // settings cascade automatically because the resolver is model-keyed.
  const [useJobsModel, setUseJobsModel] = useState(false);
  const [jobModel, setJobModel] = useState("");
  const [jobsModelSaving, setJobsModelSaving] = useState(false);
  const [jobsModelSaved, setJobsModelSaved] = useState(false);
  const [jobsModelError, setJobsModelError] = useState("");

  // Per-model overrides — keyed by model name. When the user picks a
  // model in the LLM dropdown, the form fields below are populated from
  // this map (or fall back to the global defaults). Saving the form
  // writes back to this map for the currently selected model.
  const [modelDefaults, setModelDefaults] = useState<Record<string, ModelSettings>>({});
  /**
   * Snapshot of the global server-side defaults, used to fill the form
   * when the currently selected model has no overrides. Refreshed on
   * initial load and after every save so the "Reset to global" button
   * always resets to the latest server values.
   */
  const [globalDefaults, setGlobalDefaults] = useState<{
    temperature: number; topP: number; topK: number; numPredict: number;
    numCtx: number;
  }>({ temperature: 1.0, topP: 0.95, topK: 64, numPredict: 4096, numCtx: 16384 });
  /**
   * Refs the "load on model change" effect can read without retriggering
   * the effect itself. We need the current global defaults and the
   * current modelDefaults map at the moment the user changes the model.
   */
  const globalDefaultsRef = useRef(globalDefaults);
  const modelDefaultsRef = useRef(modelDefaults);
  useEffect(() => { globalDefaultsRef.current = globalDefaults; }, [globalDefaults]);
  useEffect(() => { modelDefaultsRef.current = modelDefaults; }, [modelDefaults]);
  /**
   * Tracks the model name that the form was last populated for, so the
   * model-change effect only re-applies when the model *actually* changes
   * (not on every render or save). Set to "" initially.
   */
  const lastAppliedModelRef = useRef<string>("");

  // Narrator voice
  const [voices, setVoices] = useState<{ id: string; name: string; gender: string; language: string }[]>([]);
  const [narratorVoice, setNarratorVoice] = useState("");
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSuccess, setVoiceSuccess] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  // TTS
  const [ttsUrl, setTtsUrl] = useState("");
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsVolume, setTtsVolume] = useState(0.8);
  const [ttsFormat, setTtsFormat] = useState("mp3");
  const [ttsAutoPlay, setTtsAutoPlay] = useState(true);
  const [ttsSkipLong, setTtsSkipLong] = useState(true);
  const [ttsLongThreshold, setTtsLongThreshold] = useState(500);
  const [ttsSaving, setTtsSaving] = useState(false);
  const [ttsSuccess, setTtsSuccess] = useState(false);

  // Cache
  const [cacheStats, setCacheStats] = useState<TTSCacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheClearing, setCacheClearing] = useState(false);

  // Auth state
  const [authError, setAuthError] = useState(false);

  // Connection status
  const [connOllama, setConnOllama] = useState<{ status: string; modelCount?: number; error?: string }>({ status: "loading" });
  const [connKokoro, setConnKokoro] = useState<{ status: string; voiceCount?: number; error?: string }>({ status: "loading" });
  const [connLoading, setConnLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tts/voices").then(r => { if (!r.ok && r.status === 401) setAuthError(true); return r.json(); }).then(d => setVoices(d.voiceDetails || [])).catch(() => {});
    fetch("/api/voice-assignments?entityType=narrator&entityId=default").then(r => { if (!r.ok && r.status === 401) setAuthError(true); return r.json(); }).then(d => { if (d.assignment) setNarratorVoice(d.assignment.voiceName); }).catch(() => {});
    fetch("/api/tts/cache").then(r => { if (!r.ok && r.status === 401) setAuthError(true); return r.json(); }).then(d => { setCacheStats(d.stats); setCacheLoading(false); }).catch(() => setCacheLoading(false));
    fetch("/api/health").then(r => r.json()).then(d => { setConnOllama(d.ollama || { status: "error" }); setConnKokoro(d.kokoro || { status: "error" }); setConnLoading(false); }).catch(() => { setConnOllama({ status: "error" }); setConnKokoro({ status: "error" }); setConnLoading(false); });
  }, []);

  useEffect(() => {
    fetch("/api/settings").then(async (res) => {
      if (res.status === 401) { setAuthError(true); setLoading(false); return; }
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings(data);
      setSelectedLLM(data.ollama?.model ?? "");
      setSelectedEmbedding(data.ollama?.embeddingModel ?? "");
      setThinkingMode(data.ollama?.thinkingMode ?? false);

      // Capture the global defaults BEFORE applying per-model overrides,
      // so the "Reset to global" button always restores the true global
      // values (not the per-model values of the previously-selected model).
      // The fallback values here are the OLLAMA_CONFIG hardcoded defaults
      // (mirrored for the UI) — server config no longer stores global
      // sampling parameters.
      const globals = {
        temperature: 1.0,
        topP: 0.95,
        topK: 64,
        numPredict: 4096,
        numCtx: 16384,
      };
      setGlobalDefaults(globals);
      setUseCustomSampling(data.ollama?.useCustomSampling ?? false);
      setUseJobsModel(data.ollama?.useJobsModel ?? false);
      // Default the jobs-model picker to the chat model; the server
      // returns the saved value (could be null) so we fall back
      // gracefully on first load.
      setJobModel(data.ollama?.jobModel || data.ollama?.model || "");

      // Load the per-model overrides map and apply the currently selected
      // model's overrides (if any) on top of the globals. The model-change
      // effect below will then keep the form in sync as the user switches
      // models. If the saved `selectedNumCtx` differs from the model's
      // override, prefer the model's override (the saved value is the
      // legacy global numCtx, which the model may have since overridden).
      const modelMap: Record<string, ModelSettings> = data.modelDefaults ?? {};
      setModelDefaults(modelMap);
      const initialModel = data.ollama?.model ?? "";
      const modelOverride = initialModel ? modelMap[initialModel] : undefined;
      setSelectedNumCtx(modelOverride?.numCtx ?? globals.numCtx);
      setTemperature(modelOverride?.temperature ?? globals.temperature);
      setTopP(modelOverride?.topP ?? globals.topP);
      setTopK(modelOverride?.topK ?? globals.topK);
      setNumPredict(modelOverride?.numPredict ?? globals.numPredict);
      // Mark the initial model as "already applied" so the effect below
      // doesn't re-apply on the very first render and clobber any values
      // the user has already started editing in their head. (We also
      // gate the effect on this ref to avoid an infinite loop.)
      lastAppliedModelRef.current = initialModel;
      const oh = data.ollama?.host ?? ""; const op = data.ollama?.port ?? "";
      setOllamaUrl(op ? `${oh}:${op}` : oh);
      const th = data.tts?.host ?? ""; const tp = data.tts?.port ?? "";
      setTtsUrl(tp ? `${th}:${tp}` : th);
      if (data.defaults) {
        if (data.defaults.ttsSpeed !== undefined) setTtsSpeed(data.defaults.ttsSpeed);
        if (data.defaults.ttsVolume !== undefined) setTtsVolume(data.defaults.ttsVolume);
        if (data.defaults.ttsFormat) setTtsFormat(data.defaults.ttsFormat);
        if (data.defaults.ttsAutoPlay !== undefined) setTtsAutoPlay(data.defaults.ttsAutoPlay);
        if (data.defaults.ttsSkipLong !== undefined) setTtsSkipLong(data.defaults.ttsSkipLong);
        if (data.defaults.ttsLongThreshold !== undefined) setTtsLongThreshold(data.defaults.ttsLongThreshold);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    queueMicrotask(() => setModelLoading(true));
    fetch(`/api/models/ollama${ollamaUrl ? `?url=${encodeURIComponent(ollamaUrl)}` : ""}`).then(r => { if (!r.ok && r.status === 401) setAuthError(true); return r.json(); }).then(d => { setOllamaConnected(d.connected); setModels(d.models || []); setModelLoading(false); }).catch(() => setModelLoading(false));
    fetch("/api/ollama/models").then(r => { if (!r.ok && r.status === 401) setAuthError(true); return r.json(); }).then(d => setLocalModels(d.models || [])).catch(() => {});
  }, [ollamaUrl]);

  /**
   * Apply per-model overrides when the user changes the LLM dropdown.
   * Reads the latest modelDefaults + globalDefaults from refs to avoid
   * retriggering on every state change. The lastAppliedModelRef guard
   * ensures we only re-populate the form when the model actually
   * changes (not on initial mount, not on saves).
   */
  useEffect(() => {
    if (!selectedLLM) return;
    if (lastAppliedModelRef.current === selectedLLM) return;
    lastAppliedModelRef.current = selectedLLM;
    const override = modelDefaultsRef.current[selectedLLM];
    const g = globalDefaultsRef.current;
    setSelectedNumCtx(override?.numCtx ?? g.numCtx);
    setTemperature(override?.temperature ?? g.temperature);
    setTopP(override?.topP ?? g.topP);
    setTopK(override?.topK ?? g.topK);
    setNumPredict(override?.numPredict ?? g.numPredict);
  }, [selectedLLM]);

  async function handleNarratorVoice() {
    setVoiceSaving(true); setVoiceError("");
    try {
      const res = await fetch("/api/voice-assignments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: "narrator", entityId: "default", voiceName: narratorVoice }) });
      if (res.ok) { setVoiceSuccess(true); setTimeout(() => setVoiceSuccess(false), TIMEOUTS.HEALTH_CHECK); }
      else { const err = await res.json().catch(() => ({ error: "Failed" })); setVoiceError(err.error || "Failed"); }
    } catch { setVoiceError("Connection failed"); }
    finally { setVoiceSaving(false); }
  }

  async function handleTTSSettings() {
    setTtsSaving(true);
    try {
      const changes: Record<string, unknown> = {};
      if (ttsSpeed !== undefined) changes.ttsDefaultSpeed = ttsSpeed;
      if (ttsVolume !== undefined) changes.ttsDefaultVolume = ttsVolume;
      if (ttsFormat) changes.ttsDefaultFormat = ttsFormat;
      if (ttsAutoPlay !== undefined) changes.ttsAutoPlay = ttsAutoPlay;
      if (ttsSkipLong !== undefined) changes.ttsSkipLong = ttsSkipLong;
      if (ttsLongThreshold !== undefined) changes.ttsLongThreshold = ttsLongThreshold;
      if (ttsUrl) { const [h = "", p = ""] = ttsUrl.split(":"); changes.ttsHost = h; if (p) changes.ttsPort = parseInt(p, 10); }
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      if (res.ok) { setTtsSuccess(true); setTimeout(() => setTtsSuccess(false), TIMEOUTS.HEALTH_CHECK); const upd = await fetch("/api/settings").then(r => r.json()); setSettings(upd); }
    } finally { setTtsSaving(false); }
  }

  async function handleClearCache(action: string) {
    setCacheClearing(true);
    try {
      await fetch(`/api/tts/cache?action=${action}`, { method: "DELETE" });
      const statsRes = await fetch("/api/tts/cache"); const statsData = await statsRes.json(); setCacheStats(statsData.stats);
    } finally { setCacheClearing(false); }
  }

  async function handleRefreshModels() {
    setModelLoading(true); setModelError("");
    try {
      const urlParam = ollamaUrl ? `?url=${encodeURIComponent(ollamaUrl)}` : "";
      const res = await fetch(`/api/models/ollama${urlParam}`); const json = await res.json();
      setOllamaConnected(json.connected); setModels(json.models || []);
      if (!json.connected) setModelError(`Cannot connect to Ollama at ${ollamaUrl || json.host}`);
      const mr = await fetch("/api/ollama/models"); const md = await mr.json(); setLocalModels(md.models || []);
    } catch { setModelError("Failed to fetch models"); }
    finally { setModelLoading(false); }
  }

  async function handleRefreshConnections() {
    setConnLoading(true);
    try { const res = await fetch("/api/health"); const json = await res.json(); setConnOllama(json.ollama || { status: "error" }); setConnKokoro(json.kokoro || { status: "error" }); }
    catch { setConnOllama({ status: "error" }); setConnKokoro({ status: "error" }); }
    finally { setConnLoading(false); }
  }

  /**
   * Unified save for the per-model override slot. ALL tunable generation
   * parameters (temperature / top_p / top_k / num_predict / num_ctx) live
   * in `model_defaults[selectedLLM]` — there is no global sampling config
   * anywhere in the schema. Pass a partial ModelSettings to update only
   * the fields you care about; the rest of the model's overrides are
   * preserved.
   *
   * Used by:
   *   - "Save Model" button (numCtx only)
   *   - "Save Generation Defaults" button (temperature/top_p/top_k/num_predict)
   *   - "Apply" / "Apply both" button next to Context Window (numCtx+num_predict)
   */
  async function handleSaveModelSettings(partial: Partial<ModelSettings>) {
    if (!selectedLLM) {
      setModelError("No model selected");
      return;
    }
    setModelSaving(true); setModelError("");
    try {
      const updatedMap: Record<string, ModelSettings> = {
        ...modelDefaults,
        [selectedLLM]: { ...(modelDefaults[selectedLLM] ?? {}), ...partial },
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelDefaults: updatedMap }),
      });
      if (res.ok) {
        setModelSaved(true); setTimeout(() => setModelSaved(false), TIMEOUTS.HEALTH_CHECK);
        const upd = await fetch("/api/settings").then(r => r.json());
        setSettings(upd);
        if (upd.modelDefaults) setModelDefaults(upd.modelDefaults);
      } else {
        const eb = await res.json();
        setModelError(eb.error || "Failed");
      }
    } catch {
      setModelError("Connection failed");
    } finally {
      setModelSaving(false);
    }
  }

  /**
   * "Save Model" button handler. Saves the model-selection and host
   * fields (which are global, not per-model) and writes numCtx into
   * the per-model override slot.
   */
  async function handleModelSave() {
    setModelSaving(true); setModelError("");
    try {
      const changes: Record<string, unknown> = {
        ollamaModel: selectedLLM,
        ollamaEmbeddingModel: selectedEmbedding,
      };
      if (ollamaUrl) { const [h = "", p = ""] = ollamaUrl.split(":"); changes.ollamaHost = h; if (p) changes.ollamaPort = parseInt(p, 10); }

      // Persist numCtx as a per-model override for the currently selected
      // model. We merge into the existing map so we don't clobber other
      // models' overrides.
      if (selectedLLM) {
        const updatedMap: Record<string, ModelSettings> = {
          ...modelDefaults,
          [selectedLLM]: { ...(modelDefaults[selectedLLM] ?? {}), numCtx: selectedNumCtx },
        };
        changes.modelDefaults = updatedMap;
      }

      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      if (res.ok) {
        setModelSaved(true); setTimeout(() => setModelSaved(false), TIMEOUTS.HEALTH_CHECK);
        const upd = await fetch("/api/settings").then(r => r.json());
        setSettings(upd);
        // Sync the per-model map with the canonical server state.
        if (upd.modelDefaults) setModelDefaults(upd.modelDefaults);
      }
      else { const eb = await res.json(); setModelError(eb.error || "Failed"); }
    } catch { setModelError("Connection failed"); }
    finally { setModelSaving(false); }
  }

  /**
   * Combined save for the "Apply" button next to Context Window. Pushes
   * BOTH the recommended numCtx AND the recommended num_predict into
   * the active model's per-model override slot in a single PUT.
   *
   * Called after the component has already set the form state for both
   * values, so we read them straight from React state here.
   */
  async function handleApplyAutoTune() {
    await handleSaveModelSettings({ numCtx: selectedNumCtx, numPredict });
  }

  async function handleThinkingModeChange(v: boolean) {
    setThinkingMode(v);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaThinkingMode: v }),
      });
      const upd = await fetch("/api/settings").then(r => r.json());
      setSettings(upd);
    } catch {
      // Non-fatal — revert on next load
    }
  }

  async function handleUseCustomSamplingChange(v: boolean) {
    setUseCustomSampling(v);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaUseCustomSampling: v }),
      });
      const upd = await fetch("/api/settings").then(r => r.json());
      setSettings(upd);
    } catch {
      // Non-fatal
    }
  }

  async function handleSaveJobsModel() {
    setJobsModelSaving(true); setJobsModelError("");
    try {
      // Send both fields together so the API persists them atomically.
      // If the toggle is off, persist an explicit null for jobModel
      // so a previously-saved value is cleared (the API uses the
      // current state, not partial-merge, for these columns).
      const payload: { ollamaUseJobsModel: boolean; ollamaJobModel: string | null } = {
        ollamaUseJobsModel: useJobsModel,
        ollamaJobModel: useJobsModel && jobModel ? jobModel : null,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const upd = await res.json();
      setSettings(upd);
      setJobsModelSaved(true);
      setTimeout(() => setJobsModelSaved(false), TIMEOUTS.HEALTH_CHECK);
    } catch (err) {
      setJobsModelError((err as Error).message || "Connection failed");
    } finally {
      setJobsModelSaving(false);
    }
  }

  async function handleSaveDefaults() {
    setDefaultsSaving(true); setDefaultsError("");
    try {
      // Generation defaults (temperature/top_p/top_k/num_predict) are
      // per-model — write them to the selected model's override slot
      // via the unified save handler.
      await handleSaveModelSettings({ temperature, topP, topK, numPredict });
      setDefaultsSaved(true); setTimeout(() => setDefaultsSaved(false), TIMEOUTS.HEALTH_CHECK);
    } catch {
      setDefaultsError("Connection failed");
    } finally {
      setDefaultsSaving(false);
    }
  }

  /**
   * Reset the currently selected model's overrides back to the global
   * defaults. Removes the entry from the per-model map entirely so
   * future generations use the hardcoded OLLAMA_CONFIG fallbacks for
   * this model. Only available when the model actually has overrides.
   */
  async function handleResetModelOverrides() {
    if (!selectedLLM) return;
    if (!modelDefaults[selectedLLM]) return;
    setModelError(""); setDefaultsError("");
    try {
      const updatedMap: Record<string, ModelSettings> = { ...modelDefaults };
      delete updatedMap[selectedLLM];
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelDefaults: updatedMap }),
      });
      if (res.ok) {
        const upd = await fetch("/api/settings").then(r => r.json());
        setSettings(upd);
        if (upd.modelDefaults) setModelDefaults(upd.modelDefaults);
        // Populate the form with the current global defaults.
        const g = globalDefaultsRef.current;
        setSelectedNumCtx(g.numCtx);
        setTemperature(g.temperature);
        setTopP(g.topP);
        setTopK(g.topK);
        setNumPredict(g.numPredict);
      }
    } catch { setModelError("Connection failed"); }
  }

  if (loading) return <div />;

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-text-primary">Server Settings</h1>
          <p className="mt-1 text-xs text-text-muted">Ollama, TTS, and connection defaults</p>
        </div>
      </div>

      <ConnectionStatusSection connOllama={connOllama} connKokoro={connKokoro} connLoading={connLoading} handleRefreshConnections={handleRefreshConnections} />

      <OllamaSettingsSection
        ollamaConnected={ollamaConnected} models={models} localModels={localModels}
        selectedLLM={selectedLLM} setSelectedLLM={setSelectedLLM}
        selectedEmbedding={selectedEmbedding} setSelectedEmbedding={setSelectedEmbedding}
        selectedNumCtx={selectedNumCtx} setSelectedNumCtx={setSelectedNumCtx}
        ollamaUrl={ollamaUrl} setOllamaUrl={setOllamaUrl}
        thinkingMode={thinkingMode} onThinkingModeChange={handleThinkingModeChange}
        modelLoading={modelLoading} modelSaving={modelSaving} modelSaved={modelSaved} modelError={modelError}
        settings={settings ? { ...settings, user: { llmModel: selectedLLM, embeddingModel: selectedEmbedding } } : null}
        handleRefreshModels={handleRefreshModels} handleModelSave={handleModelSave}
        // Generation defaults
        useCustomSampling={useCustomSampling} onUseCustomSamplingChange={handleUseCustomSamplingChange}
        // Jobs model (separate LLM for background jobs)
        useJobsModel={useJobsModel} onUseJobsModelChange={setUseJobsModel}
        jobModel={jobModel} setJobModel={setJobModel}
        jobsModelSaving={jobsModelSaving} jobsModelSaved={jobsModelSaved} jobsModelError={jobsModelError}
        onSaveJobsModel={handleSaveJobsModel}
        temperature={temperature} setTemperature={setTemperature}
        topP={topP} setTopP={setTopP}
        topK={topK} setTopK={setTopK}
        numPredict={numPredict} setNumPredict={setNumPredict}
        defaultsSaving={defaultsSaving} defaultsSaved={defaultsSaved} defaultsError={defaultsError}
        onSaveDefaults={handleSaveDefaults}
        // Per-model overrides
        hasModelOverrides={Boolean(selectedLLM && modelDefaults[selectedLLM])}
        onResetModelOverrides={handleResetModelOverrides}
        onApplyAutoTune={handleApplyAutoTune}
      />

      {/* Link to the new benchmark page */}
      <Link
        href="/settings/benchmark"
        className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated p-5 hover:border-accent transition-colors group"
      >
        <Gauge className="h-4 w-4 text-text-accent" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
            LLM Benchmark
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Find optimal num_ctx × num_predict for any model, plus standalone roleplay lore fidelity testing
          </p>
        </div>
        <span className="text-xs text-accent shrink-0">Open →</span>
      </Link>

      <NarratorVoiceSection voices={voices} narratorVoice={narratorVoice} voiceSaving={voiceSaving} voiceSuccess={voiceSuccess} voiceError={voiceError} setNarratorVoice={setNarratorVoice} handleNarratorVoice={handleNarratorVoice} />

      <TTSSettingsSection
        ttsUrl={ttsUrl} setTtsUrl={setTtsUrl}
        ttsSpeed={ttsSpeed} setTtsSpeed={setTtsSpeed} ttsVolume={ttsVolume} setTtsVolume={setTtsVolume}
        ttsFormat={ttsFormat} setTtsFormat={setTtsFormat}
        ttsAutoPlay={ttsAutoPlay} setTtsAutoPlay={setTtsAutoPlay}
        ttsSkipLong={ttsSkipLong} setTtsSkipLong={setTtsSkipLong} ttsLongThreshold={ttsLongThreshold} setTtsLongThreshold={setTtsLongThreshold}
        ttsSaving={ttsSaving} ttsSuccess={ttsSuccess} handleTTSSettings={handleTTSSettings}
        cacheStats={cacheStats} cacheLoading={cacheLoading} cacheClearing={cacheClearing} handleClearCache={handleClearCache}
      />
    </div>
  );
}
