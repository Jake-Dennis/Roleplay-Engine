"use client";

import { useState, FormEvent, useEffect } from "react";
import { OllamaSettingsSection } from "./ollama-settings";
import { TTSSettingsSection } from "./tts-settings";
import { ServerInfoSection } from "@/components/settings/server-info-section";
import { ConnectionStatusSection } from "@/components/settings/connection-status-section";
import { NarratorVoiceSection } from "@/components/settings/narrator-voice-section";
import { ChangePasswordSection } from "@/components/settings/change-password-section";
import { TIMEOUTS } from "@/lib/config";
import { logger } from "@/lib/logger";

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
      .catch((err) => logger.warn("TTS voices fetch failed", err));

    // Load narrator voice assignment
    fetch("/api/voice-assignments?entityType=narrator&entityId=default")
      .then((res) => res.json())
      .then((data) => {
        if (data.assignment) {
          setNarratorVoice(data.assignment.voice_name);
        }
      })
      .catch((err) => logger.warn("voice assignments fetch failed", err));

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
          if (data.user.ttsSpeed !== undefined) setTtsSpeed(data.user.ttsSpeed);
          if (data.user.ttsVolume !== undefined) setTtsVolume(data.user.ttsVolume);
          if (data.user.ttsFormat) setTtsFormat(data.user.ttsFormat);
          if (data.user.ttsAutoPlay !== undefined) setTtsAutoPlay(data.user.ttsAutoPlay);
          if (data.user.ttsSkipLong !== undefined) setTtsSkipLong(data.user.ttsSkipLong);
          if (data.user.ttsLongThreshold !== undefined) setTtsLongThreshold(data.user.ttsLongThreshold);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load available Ollama models
    queueMicrotask(() => setModelLoading(true));
    fetch("/api/models/ollama")
      .then((res) => res.json())
      .then((data) => {
        setOllamaConnected(data.connected);
        setLlmModels(data.llmModels || []);
        setEmbeddingModels(data.embeddingModels || []);
        setModelLoading(false);
      })
      .catch(() => setModelLoading(false));

    // Load local model names for availability checking
    fetch("/api/ollama/models")
      .then((res) => res.json())
      .then((data) => {
        setLocalModels(data.models || []);
      })
      .catch((err) => logger.warn("ollama models fetch failed", err));
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
      setTimeout(() => setVoiceSuccess(false), TIMEOUTS.HEALTH_CHECK);
    } finally {
      setVoiceSaving(false);
    }
  }

  async function handleTTSSettings() {
    setTtsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ttsSpeed,
          ttsVolume,
          ttsFormat,
          ttsAutoPlay,
          ttsSkipLong,
          ttsLongThreshold,
        }),
      });
      if (res.ok) {
        setTtsSuccess(true);
        setTimeout(() => setTtsSuccess(false), TIMEOUTS.HEALTH_CHECK);
      }
    } finally {
      setTtsSaving(false);
    }
  }

  async function handleClearCache(action: string) {
    setCacheClearing(true);
    try {
      const res = await fetch(`/api/tts/cache?action=${action}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
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
      const json = await res.json();
      setOllamaConnected(json.connected);
      setLlmModels(json.llmModels || []);
      setEmbeddingModels(json.embeddingModels || []);
      if (!json.connected) {
        setModelError(`Cannot connect to Ollama at ${json.host}`);
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
      const json = await res.json();
      setConnOllama(json.ollama || { status: "error" });
      setConnKokoro(json.kokoro || { status: "error" });
    } catch {
      setConnOllama({ status: "error", error: "Health check failed" });
      setConnKokoro({ status: "error", error: "Health check failed" });
    } finally {
      setConnLoading(false);
    }
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
        setTimeout(() => setModelSaved(false), TIMEOUTS.HEALTH_CHECK);
      } else {
        const errorBody = await res.json();
        setModelError(errorBody.error || "Failed to save model settings");
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

      const json = await res.json();

      if (!res.ok) {
        setPasswordError(json.error || "Failed to change password");
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

      <ServerInfoSection loading={loading} settings={settings} />

      <ConnectionStatusSection
        connOllama={connOllama}
        connKokoro={connKokoro}
        connLoading={connLoading}
        handleRefreshConnections={handleRefreshConnections}
      />

      {/* Model Selection */}
      <OllamaSettingsSection
        ollamaConnected={ollamaConnected}
        llmModels={llmModels}
        embeddingModels={embeddingModels}
        localModels={localModels}
        selectedLLM={selectedLLM}
        setSelectedLLM={setSelectedLLM}
        selectedEmbedding={selectedEmbedding}
        setSelectedEmbedding={setSelectedEmbedding}
        modelLoading={modelLoading}
        modelSaving={modelSaving}
        modelSaved={modelSaved}
        modelError={modelError}
        settings={settings}
        handleRefreshModels={handleRefreshModels}
        handleModelSave={handleModelSave}
      />

      <NarratorVoiceSection
        voices={voices}
        narratorVoice={narratorVoice}
        voiceSaving={voiceSaving}
        voiceSuccess={voiceSuccess}
        setNarratorVoice={setNarratorVoice}
        handleNarratorVoice={handleNarratorVoice}
      />

      {/* TTS Settings & Cache */}
      <TTSSettingsSection
        ttsSpeed={ttsSpeed}
        setTtsSpeed={setTtsSpeed}
        ttsVolume={ttsVolume}
        setTtsVolume={setTtsVolume}
        ttsFormat={ttsFormat}
        setTtsFormat={setTtsFormat}
        ttsAutoPlay={ttsAutoPlay}
        setTtsAutoPlay={setTtsAutoPlay}
        ttsSkipLong={ttsSkipLong}
        setTtsSkipLong={setTtsSkipLong}
        ttsLongThreshold={ttsLongThreshold}
        setTtsLongThreshold={setTtsLongThreshold}
        ttsSaving={ttsSaving}
        ttsSuccess={ttsSuccess}
        handleTTSSettings={handleTTSSettings}
        cacheStats={cacheStats}
        cacheLoading={cacheLoading}
        cacheClearing={cacheClearing}
        handleClearCache={handleClearCache}
      />

      <ChangePasswordSection
        currentPassword={currentPassword}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        passwordError={passwordError}
        passwordSuccess={passwordSuccess}
        passwordSaving={passwordSaving}
        setCurrentPassword={setCurrentPassword}
        setNewPassword={setNewPassword}
        setConfirmPassword={setConfirmPassword}
        handlePasswordChange={handlePasswordChange}
      />
    </div>
  );
}
