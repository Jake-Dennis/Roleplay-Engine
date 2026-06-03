"use client";

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OllamaSettingsSection } from "../ollama-settings";
import { TTSSettingsSection } from "../tts-settings";
import { ConnectionStatusSection } from "@/components/settings/connection-status-section";
import { NarratorVoiceSection } from "@/components/settings/narrator-voice-section";
import { ContextBenchmarkSection } from "@/components/settings/context-benchmark";
import { TIMEOUTS } from "@/lib/config";

interface ServerSettings {
  ollama: { host: string; port?: number; model: string; embeddingModel: string; thinkingMode: boolean; numCtx?: number | null; localModels?: string[] };
  tts: { host: string; port?: number; defaultVoice: string };
  defaults?: {
    ttsSpeed: number; ttsVolume: number; ttsFormat: string;
    ttsAutoPlay: boolean; ttsSkipLong: boolean; ttsLongThreshold: number;
  };
}

interface OllamaModel { name: string; parameterSize: string; family: string }
interface TTSCacheStats {
  totalEntries: number; totalDurationMs: number; totalUses: number;
  oldestEntry: string | null; lastUsed: string | null;
  diskSize: number; diskSizeFormatted: string; fileCount: number;
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
  const [useCustomSampling, setUseCustomSampling] = useState(true);
  const [temperature, setTemperature] = useState(1.0);
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(64);
  const [numPredict, setNumPredict] = useState(4096);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const [defaultsError, setDefaultsError] = useState("");

  // Job defaults
  const [jobNumCtx, setJobNumCtx] = useState(32768);
  const [jobNumPredict, setJobNumPredict] = useState(2048);
  const [jobDefaultsSaving, setJobDefaultsSaving] = useState(false);
  const [jobDefaultsSaved, setJobDefaultsSaved] = useState(false);
  const [jobDefaultsError, setJobDefaultsError] = useState("");

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
    setAuthError(false);
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
      setSelectedNumCtx(data.ollama?.numCtx ?? 16384);
      setUseCustomSampling(data.ollama?.useCustomSampling ?? true);
      setTemperature(data.ollama?.temperature ?? 1.0);
      setTopP(data.ollama?.topP ?? 0.95);
      setTopK(data.ollama?.topK ?? 64);
      setNumPredict(data.ollama?.numPredict ?? 4096);
      setJobNumCtx(data.ollama?.jobNumCtx ?? 32768);
      setJobNumPredict(data.ollama?.jobNumPredict ?? 2048);
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
  }, []);

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

  async function handleModelSave() {
    setModelSaving(true); setModelError("");
    try {
      const changes: Record<string, unknown> = {
        ollamaModel: selectedLLM,
        ollamaEmbeddingModel: selectedEmbedding,
        ollamaNumCtx: selectedNumCtx,
      };
      if (ollamaUrl) { const [h = "", p = ""] = ollamaUrl.split(":"); changes.ollamaHost = h; if (p) changes.ollamaPort = parseInt(p, 10); }
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      if (res.ok) { setModelSaved(true); setTimeout(() => setModelSaved(false), TIMEOUTS.HEALTH_CHECK); const upd = await fetch("/api/settings").then(r => r.json()); setSettings(upd); }
      else { const eb = await res.json(); setModelError(eb.error || "Failed"); }
    } catch { setModelError("Connection failed"); }
    finally { setModelSaving(false); }
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

  async function handleSaveDefaults() {
    setDefaultsSaving(true); setDefaultsError("");
    try {
      const changes: Record<string, unknown> = {
        ollamaTemperature: temperature,
        ollamaTopP: topP,
        ollamaTopK: topK,
        ollamaNumPredict: numPredict,
      };
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      if (res.ok) { setDefaultsSaved(true); setTimeout(() => setDefaultsSaved(false), TIMEOUTS.HEALTH_CHECK); const upd = await fetch("/api/settings").then(r => r.json()); setSettings(upd); }
      else { const eb = await res.json(); setDefaultsError(eb.error || "Failed"); }
    } catch { setDefaultsError("Connection failed"); }
    finally { setDefaultsSaving(false); }
  }

  async function handleSaveJobDefaults() {
    setJobDefaultsSaving(true); setJobDefaultsError("");
    try {
      const changes: Record<string, unknown> = {
        ollamaJobNumCtx: jobNumCtx,
        ollamaJobNumPredict: jobNumPredict,
      };
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      if (res.ok) { setJobDefaultsSaved(true); setTimeout(() => setJobDefaultsSaved(false), TIMEOUTS.HEALTH_CHECK); const upd = await fetch("/api/settings").then(r => r.json()); setSettings(upd); }
      else { const eb = await res.json(); setJobDefaultsError(eb.error || "Failed"); }
    } catch { setJobDefaultsError("Connection failed"); }
    finally { setJobDefaultsSaving(false); }
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
        temperature={temperature} setTemperature={setTemperature}
        topP={topP} setTopP={setTopP}
        topK={topK} setTopK={setTopK}
        numPredict={numPredict} setNumPredict={setNumPredict}
        defaultsSaving={defaultsSaving} defaultsSaved={defaultsSaved} defaultsError={defaultsError}
        onSaveDefaults={handleSaveDefaults}
        // Job defaults
        jobNumCtx={jobNumCtx} setJobNumCtx={setJobNumCtx}
        jobNumPredict={jobNumPredict} setJobNumPredict={setJobNumPredict}
        jobDefaultsSaving={jobDefaultsSaving} jobDefaultsSaved={jobDefaultsSaved} jobDefaultsError={jobDefaultsError}
        onSaveJobDefaults={handleSaveJobDefaults}
      />

      <ContextBenchmarkSection
        defaultModel={selectedLLM}
        localModels={localModels}
      />

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
