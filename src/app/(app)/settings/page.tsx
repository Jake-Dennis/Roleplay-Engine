"use client";

import { useState, FormEvent, useEffect } from "react";
import { Save, Sparkles, Server, Key, Check, Volume2, Trash2, HardDrive, Gauge, Settings2, Cpu, RefreshCw, AlertCircle, Wifi, WifiOff } from "lucide-react";

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
  };
}

interface OllamaModel {
  name: string;
  parameterSize: string;
  family: string;
}

interface OllamaEmbeddingModel {
  name: string;
  parameterSize: string;
}

interface TTSCacheStats {
  totalEntries: number;
  totalDurationMs: number;
  totalUses: number;
  oldestEntry: string | null;
  lastUsed: string | null;
  diskSize: number;
  diskSizeFormatted: string;
  fileCount: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Model selection
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [llmModels, setLlmModels] = useState<OllamaModel[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<OllamaEmbeddingModel[]>([]);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [selectedLLM, setSelectedLLM] = useState("");
  const [selectedEmbedding, setSelectedEmbedding] = useState("");
  const [modelLoading, setModelLoading] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [modelError, setModelError] = useState("");

  // Narrator voice
  const [voices, setVoices] = useState<{ id: string; name: string; gender: string; language: string }[]>([]);
  const [narratorVoice, setNarratorVoice] = useState("");
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSuccess, setVoiceSuccess] = useState(false);

  // TTS settings
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsVolume, setTtsVolume] = useState(0.8);
  const [ttsFormat, setTtsFormat] = useState("mp3");
  const [ttsAutoPlay, setTtsAutoPlay] = useState(true);
  const [ttsSkipLong, setTtsSkipLong] = useState(true);
  const [ttsLongThreshold, setTtsLongThreshold] = useState(500);
  const [ttsSaving, setTtsSaving] = useState(false);
  const [ttsSuccess, setTtsSuccess] = useState(false);

  // TTS cache
  const [cacheStats, setCacheStats] = useState<TTSCacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheClearing, setCacheClearing] = useState(false);

  // Connection status
  const [connOllama, setConnOllama] = useState<{ status: string; modelCount?: number; error?: string }>({ status: "loading" });
  const [connKokoro, setConnKokoro] = useState<{ status: string; voiceCount?: number; error?: string }>({ status: "loading" });
  const [connLoading, setConnLoading] = useState(true);

  useEffect(() => {
    // Load voices
    fetch("/api/tts/voices")
      .then((res) => res.json())
      .then((data) => {
        setVoices(data.voiceDetails || []);
      })
      .catch((err) => console.warn("[settings] TTS voices fetch failed:", err));

    // Load narrator voice assignment
    fetch("/api/voice-assignments?entityType=narrator&entityId=default")
      .then((res) => res.json())
      .then((data) => {
        if (data.assignment) {
          setNarratorVoice(data.assignment.voice_name);
        }
      })
      .catch((err) => console.warn("[settings] voice assignments fetch failed:", err));

    // Load TTS settings from localStorage
    const savedSpeed = localStorage.getItem("tts-speed");
    const savedVolume = localStorage.getItem("tts-volume");
    const savedFormat = localStorage.getItem("tts-format");
    const savedAutoPlay = localStorage.getItem("tts-autoplay");
    const savedSkipLong = localStorage.getItem("tts-skip-long");
    const savedThreshold = localStorage.getItem("tts-long-threshold");
    if (savedSpeed) setTtsSpeed(parseFloat(savedSpeed));
    if (savedVolume) setTtsVolume(parseFloat(savedVolume));
    if (savedFormat) setTtsFormat(savedFormat);
    if (savedAutoPlay !== null) setTtsAutoPlay(savedAutoPlay === "true");
    if (savedSkipLong !== null) setTtsSkipLong(savedSkipLong === "true");
    if (savedThreshold) setTtsLongThreshold(parseInt(savedThreshold, 10));

    // Load cache stats
    fetch("/api/tts/cache")
      .then((res) => res.json())
      .then((data) => {
        setCacheStats(data.stats);
        setCacheLoading(false);
      })
      .catch(() => setCacheLoading(false));

    // Load connection status
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setConnOllama(data.ollama || { status: "error" });
        setConnKokoro(data.kokoro || { status: "error" });
        setConnLoading(false);
      })
      .catch(() => {
        setConnOllama({ status: "error", error: "Health check failed" });
        setConnKokoro({ status: "error", error: "Health check failed" });
        setConnLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        if (data.user) {
          setSelectedLLM(data.user.llmModel);
          setSelectedEmbedding(data.user.embeddingModel);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load available Ollama models
    setModelLoading(true);
    fetch("/api/models/ollama")
      .then((res) => res.json())
      .then((data) => {
        setOllamaConnected(data.connected);
        setLlmModels(data.llmModels || []);
        setEmbeddingModels(data.embeddingModels || []);
        // Set defaults if not already set
        if (!selectedLLM) {
          setSelectedLLM(data.llmModels?.[0]?.name || data.defaultLLM || "");
        }
        if (!selectedEmbedding) {
          setSelectedEmbedding(data.embeddingModels?.[0]?.name || data.defaultEmbedding || "");
        }
        setModelLoading(false);
      })
      .catch(() => setModelLoading(false));

    // Load local model names for availability checking
    fetch("/api/ollama/models")
      .then((res) => res.json())
      .then((data) => {
        setLocalModels(data.models || []);
      })
      .catch((err) => console.warn("[settings] ollama models fetch failed:", err));
  }, []);

  async function handleNarratorVoice() {
    setVoiceSaving(true);
    try {
      await fetch("/api/voice-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "narrator",
          entityId: "default",
          voiceName: narratorVoice,
        }),
      });
      setVoiceSuccess(true);
      setTimeout(() => setVoiceSuccess(false), 3000);
    } finally {
      setVoiceSaving(false);
    }
  }

  async function handleTTSSettings() {
    setTtsSaving(true);
    try {
      localStorage.setItem("tts-speed", ttsSpeed.toString());
      localStorage.setItem("tts-volume", ttsVolume.toString());
      localStorage.setItem("tts-format", ttsFormat);
      localStorage.setItem("tts-autoplay", ttsAutoPlay.toString());
      localStorage.setItem("tts-skip-long", ttsSkipLong.toString());
      localStorage.setItem("tts-long-threshold", ttsLongThreshold.toString());
      setTtsSuccess(true);
      setTimeout(() => setTtsSuccess(false), 3000);
    } finally {
      setTtsSaving(false);
    }
  }

  async function handleClearCache(action: string) {
    setCacheClearing(true);
    try {
      const res = await fetch(`/api/tts/cache?action=${action}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        // Reload stats
        const statsRes = await fetch("/api/tts/cache");
        const statsData = await statsRes.json();
        setCacheStats(statsData.stats);
      }
    } finally {
      setCacheClearing(false);
    }
  }

  async function handleRefreshModels() {
    setModelLoading(true);
    setModelError("");
    try {
      const res = await fetch("/api/models/ollama");
      const data = await res.json();
      setOllamaConnected(data.connected);
      setLlmModels(data.llmModels || []);
      setEmbeddingModels(data.embeddingModels || []);
      if (!data.connected) {
        setModelError(`Cannot connect to Ollama at ${data.host}`);
      }
      // Also refresh local models
      const modelsRes = await fetch("/api/ollama/models");
      const modelsData = await modelsRes.json();
      setLocalModels(modelsData.models || []);
    } catch {
      setModelError("Failed to fetch models");
    } finally {
      setModelLoading(false);
    }
  }

  async function handleRefreshConnections() {
    setConnLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setConnOllama(data.ollama || { status: "error" });
      setConnKokoro(data.kokoro || { status: "error" });
    } catch {
      setConnOllama({ status: "error", error: "Health check failed" });
      setConnKokoro({ status: "error", error: "Health check failed" });
    } finally {
      setConnLoading(false);
    }
  }

  function isModelLocallyAvailable(modelName: string): boolean {
    if (localModels.length === 0) return true; // Unknown state, assume available
    return localModels.includes(modelName) || localModels.some(m => m.startsWith(modelName + ":"));
  }

  async function handleModelSave() {
    setModelSaving(true);
    setModelError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmModel: selectedLLM,
          embeddingModel: selectedEmbedding,
        }),
      });
      if (res.ok) {
        setModelSaved(true);
        setTimeout(() => setModelSaved(false), 3000);
      } else {
        const data = await res.json();
        setModelError(data.error || "Failed to save model settings");
      }
    } catch {
      setModelError("Connection failed");
    } finally {
      setModelSaving(false);
    }
  }

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordSaving(true);

    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPasswordError(data.error || "Failed to change password");
        return;
      }

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("Connection failed");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-base font-semibold text-text-primary">Settings</h1>
        <p className="mt-1 text-xs text-text-muted">Manage your account and preferences</p>
      </div>

      {/* Server Info */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Server className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Server Configuration</h2>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-muted">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span className="text-xs">Loading settings...</span>
          </div>
        ) : settings ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3.5 py-2.5">
              <span className="text-xs text-text-secondary">Ollama</span>
              <span className="text-xs text-text-primary">{settings.ollama.host}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3.5 py-2.5">
              <span className="text-xs text-text-secondary">Model</span>
              <span className="text-xs text-text-primary">{settings.ollama.model}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3.5 py-2.5">
              <span className="text-xs text-text-secondary">TTS Server</span>
              <span className="text-xs text-text-primary">{settings.tts.host}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3.5 py-2.5">
              <span className="text-xs text-text-secondary">Default Voice</span>
              <span className="text-xs text-text-primary">{settings.tts.defaultVoice}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Unable to load server settings</p>
        )}
      </div>

      {/* Connection Status */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Wifi className="h-4 w-4 text-text-accent" />
            <h2 className="text-sm font-medium text-text-primary">Connection Status</h2>
          </div>
          <button
            onClick={handleRefreshConnections}
            disabled={connLoading}
            className="flex items-center gap-1 rounded-lg bg-bg-raised px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${connLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="space-y-3">
          {/* Ollama */}
          <div className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 ${
            connOllama.status === "connected" ? "bg-success/10" : "bg-bg-raised"
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`h-2.5 w-2.5 rounded-full ${
                connOllama.status === "connected" ? "bg-green-500" : "bg-red-500"
              }`} />
              <Cpu className="h-4 w-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-primary">Ollama</p>
                <p className="text-xxs text-text-muted">
                  {connOllama.status === "connected"
                    ? `${connOllama.modelCount} models available`
                    : connOllama.error || "Unavailable"}
                </p>
              </div>
            </div>
            {connOllama.status === "connected" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>

          {/* Kokoro */}
          <div className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 ${
            connKokoro.status === "connected" ? "bg-success/10" : "bg-bg-raised"
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`h-2.5 w-2.5 rounded-full ${
                connKokoro.status === "connected" ? "bg-green-500" : "bg-red-500"
              }`} />
              <Volume2 className="h-4 w-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-primary">Kokoro TTS</p>
                <p className="text-xxs text-text-muted">
                  {connKokoro.status === "connected"
                    ? `${connKokoro.voiceCount} voices available`
                    : connKokoro.error || "Unavailable"}
                </p>
              </div>
            </div>
            {connKokoro.status === "connected" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-text-accent" />
            <h2 className="text-sm font-medium text-text-primary">Model Selection</h2>
          </div>
          <button
            onClick={handleRefreshModels}
            disabled={modelLoading}
            className="flex items-center gap-1 rounded-lg bg-bg-raised px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${modelLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
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
          {ollamaConnected ? "Connected to Ollama" : "Ollama not reachable"}
          {settings && (
            <span className="text-text-muted ml-auto">{settings.ollama.host}</span>
          )}
        </div>

        {modelError && (
          <div className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 mb-4 text-xs text-error">
            <AlertCircle className="h-3.5 w-3.5" />
            {modelError}
          </div>
        )}

        {modelLoading ? (
          <div className="flex items-center gap-2 text-text-muted">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span className="text-xs">Detecting models...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* LLM Model */}
            <div>
              <label className="mb-1.5 block text-xs text-text-secondary">
                LLM Model
                <span className="text-text-muted ml-1">(text generation)</span>
              </label>
              <select
                value={selectedLLM}
                onChange={(e) => setSelectedLLM(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                {llmModels.length === 0 && (
                  <option value={settings?.ollama.model || ""}>{settings?.ollama.model || "No models detected"}</option>
                )}
                {llmModels.map((m) => {
                  const isLocal = isModelLocallyAvailable(m.name);
                  return (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.parameterSize}, {m.family}) {isLocal ? "✓" : "⚠ not local"}
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

            {/* Embedding Model */}
            <div>
              <label className="mb-1.5 block text-xs text-text-secondary">
                Embedding Model
                <span className="text-text-muted ml-1">(vector search)</span>
              </label>
              <select
                value={selectedEmbedding}
                onChange={(e) => setSelectedEmbedding(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                {embeddingModels.length === 0 && (
                  <option value={settings?.ollama.embeddingModel || ""}>{settings?.ollama.embeddingModel || "No embedding models detected"}</option>
                )}
                {embeddingModels.map((m) => {
                  const isLocal = isModelLocallyAvailable(m.name);
                  return (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.parameterSize}) {isLocal ? "✓" : "⚠ not local"}
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
        )}
      </div>

      {/* Narrator Voice */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Volume2 className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Narrator Voice</h2>
        </div>
        <p className="text-xs text-text-muted mb-3">
          Choose the voice used for AI narration in story sessions
        </p>
        <div className="flex items-center gap-2">
          <select
            value={narratorVoice}
            onChange={(e) => setNarratorVoice(e.target.value)}
            disabled={voiceSaving}
            className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
          >
            <option value="">No voice</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name || v.id} ({v.gender}, {v.language})
              </option>
            ))}
          </select>
          <button
            onClick={handleNarratorVoice}
            disabled={voiceSaving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {voiceSaving ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </button>
        </div>
        {voiceSuccess && (
          <div className="flex items-center gap-1.5 mt-3 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Narrator voice saved
          </div>
        )}
      </div>

      {/* TTS Settings */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Settings2 className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">TTS Settings</h2>
        </div>
        <p className="text-xs text-text-muted mb-3">
          Configure text-to-speech playback preferences
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Speed: {ttsSpeed.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={ttsSpeed}
              onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xxs text-text-muted">
              <span>0.5x</span>
              <span>2.0x</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Volume: {Math.round(ttsVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={ttsVolume}
              onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xxs text-text-muted">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Format</label>
            <select
              value={ttsFormat}
              onChange={(e) => setTtsFormat(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="ogg">OGG</option>
              <option value="flac">FLAC</option>
            </select>
          </div>

          {/* Auto-play toggle */}
          <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
            <div>
              <p className="text-xs text-text-primary">Auto-play TTS</p>
              <p className="text-xxs text-text-muted">Automatically speak AI responses</p>
            </div>
            <button
              type="button"
              onClick={() => setTtsAutoPlay(!ttsAutoPlay)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                ttsAutoPlay ? "bg-accent" : "bg-bg-highlight"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  ttsAutoPlay ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Skip long messages toggle */}
          <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
            <div>
              <p className="text-xs text-text-primary">Skip long messages</p>
              <p className="text-xxs text-text-muted">Don't speak messages over {ttsLongThreshold} characters</p>
            </div>
            <button
              type="button"
              onClick={() => setTtsSkipLong(!ttsSkipLong)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                ttsSkipLong ? "bg-accent" : "bg-bg-highlight"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  ttsSkipLong ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {ttsSkipLong && (
            <div>
              <label className="mb-1 block text-xs text-text-secondary">
                Skip threshold: {ttsLongThreshold} chars
              </label>
              <input
                type="range"
                min="200"
                max="1000"
                step="50"
                value={ttsLongThreshold}
                onChange={(e) => setTtsLongThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xxs text-text-muted">
                <span>200</span>
                <span>1000</span>
              </div>
            </div>
          )}

          <button
            onClick={handleTTSSettings}
            disabled={ttsSaving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {ttsSaving ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save TTS Settings
          </button>
          {ttsSuccess && (
            <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              TTS settings saved
            </div>
          )}
        </div>
      </div>

      {/* TTS Cache Management */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <HardDrive className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">TTS Cache</h2>
        </div>

        {cacheLoading ? (
          <div className="flex items-center gap-2 text-text-muted">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span className="text-xs">Loading cache stats...</span>
          </div>
        ) : cacheStats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-bg-raised px-3.5 py-2.5 text-center">
                <p className="text-lg font-semibold text-text-primary">{cacheStats.totalEntries}</p>
                <p className="text-xxs text-text-muted">Entries</p>
              </div>
              <div className="rounded-lg bg-bg-raised px-3.5 py-2.5 text-center">
                <p className="text-lg font-semibold text-text-primary">{cacheStats.diskSizeFormatted}</p>
                <p className="text-xxs text-text-muted">Disk Size</p>
              </div>
              <div className="rounded-lg bg-bg-raised px-3.5 py-2.5 text-center">
                <p className="text-lg font-semibold text-text-primary">{cacheStats.totalUses}</p>
                <p className="text-xxs text-text-muted">Total Uses</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-xs text-text-muted">
                {cacheStats.totalDurationMs > 0
                  ? `${(cacheStats.totalDurationMs / 1000 / 60).toFixed(1)} min of audio cached`
                  : "No audio cached"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearCache("expired")}
                disabled={cacheClearing}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-overlay disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Expired
              </button>
              <button
                onClick={() => handleClearCache("unused")}
                disabled={cacheClearing}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-overlay disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Unused
              </button>
              <button
                onClick={() => handleClearCache("clear")}
                disabled={cacheClearing}
                className="flex items-center gap-1.5 rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error hover:bg-error/20 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Unable to load cache stats</p>
        )}
      </div>

      {/* Change Password */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Key className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Change Password</h2>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Current password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
              minLength={8}
              required
            />
            <p className="mt-1 text-xxs text-text-muted">
              At least 8 characters with a letter and a number
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
              minLength={8}
              required
            />
          </div>

          {passwordError && (
            <div className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              Password changed successfully
            </div>
          )}

          <button
            type="submit"
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {passwordSaving ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
