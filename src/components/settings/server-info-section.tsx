"use client";

import { useState, useEffect } from "react";
import { Sparkles, Server, Save, Check, AlertCircle } from "lucide-react";

interface ServerSettings {
  ollama: {
    host: string;
    port?: number;
    model: string;
    embeddingModel: string;
  };
  tts: {
    host: string;
    port?: number;
    defaultVoice: string;
  };
}

interface ServerInfoSectionProps {
  loading: boolean;
  settings: ServerSettings | null;
  onSave?: (changes: Record<string, unknown>) => Promise<void>;
}

export function ServerInfoSection({ loading, settings, onSave }: ServerInfoSectionProps) {
  const [ollamaHost, setOllamaHost] = useState("");
  const [ollamaPort, setOllamaPort] = useState("");
  const [ollamaModel, setOllamaModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [ttsHost, setTtsHost] = useState("");
  const [ttsPort, setTtsPort] = useState("");
  const [ttsVoice, setTtsVoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings) {
      const [oh = "", op = ""] = (settings.ollama?.host ?? "").split(":");
      setOllamaHost(oh);
      setOllamaPort(op || String(settings.ollama?.port ?? ""));
      setOllamaModel(settings.ollama?.model ?? "");
      setEmbeddingModel(settings.ollama?.embeddingModel ?? "");
      const [th = "", tp = ""] = (settings.tts?.host ?? "").split(":");
      setTtsHost(th);
      setTtsPort(tp || String(settings.tts?.port ?? ""));
      setTtsVoice(settings.tts?.defaultVoice ?? "");
    }
  }, [settings]);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const changes: Record<string, unknown> = {};
      if (ollamaHost) changes.ollamaHost = ollamaHost;
      if (ollamaPort) changes.ollamaPort = parseInt(ollamaPort, 10);
      if (ollamaModel) changes.ollamaModel = ollamaModel;
      if (embeddingModel) changes.ollamaEmbeddingModel = embeddingModel;
      if (ttsHost) changes.ttsHost = ttsHost;
      if (ttsPort) changes.ttsPort = parseInt(ttsPort, 10);
      if (ttsVoice) changes.ttsDefaultVoice = ttsVoice;
      await onSave(changes);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save server settings");
    } finally {
      setSaving(false);
    }
  }

  return (
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
        <div className="space-y-4">
          {/* Ollama Host */}
          <div className="flex items-center gap-2">
            <label className="w-28 text-xs text-text-secondary">Ollama Host</label>
            <input
              type="text"
              value={ollamaHost}
              onChange={(e) => setOllamaHost(e.target.value)}
              className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
              placeholder="e.g. 192.168.4.2"
            />
            <span className="text-xs text-text-muted">:</span>
            <input
              type="text"
              value={ollamaPort}
              onChange={(e) => setOllamaPort(e.target.value)}
              className="w-20 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
              placeholder="11434"
            />
          </div>

          {/* LLM Model */}
          <div className="flex items-center gap-2">
            <label className="w-28 text-xs text-text-secondary">LLM Model</label>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
              placeholder="qwen3.5:4b"
            />
          </div>

          {/* Embedding Model */}
          <div className="flex items-center gap-2">
            <label className="w-28 text-xs text-text-secondary">Embedding Model</label>
            <input
              type="text"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
              placeholder="bge-m3"
            />
          </div>

          {/* TTS Host */}
          <div className="flex items-center gap-2">
            <label className="w-28 text-xs text-text-secondary">TTS Host</label>
            <input
              type="text"
              value={ttsHost}
              onChange={(e) => setTtsHost(e.target.value)}
              className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
              placeholder="e.g. 192.168.4.2"
            />
            <span className="text-xs text-text-muted">:</span>
            <input
              type="text"
              value={ttsPort}
              onChange={(e) => setTtsPort(e.target.value)}
              className="w-20 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
              placeholder="8880"
            />
          </div>

          {/* TTS Default Voice */}
          <div className="flex items-center gap-2">
            <label className="w-28 text-xs text-text-secondary">Default Voice</label>
            <input
              type="text"
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary focus:border-accent"
              placeholder="af_heart"
            />
          </div>

          {/* Save / status */}
          <div className="flex items-center gap-3 pt-1">
            {onSave && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? (
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Server Config
              </button>
            )}
            {saved && (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <Check className="h-3.5 w-3.5" />
                Saved
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-error">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Unable to load server settings</p>
      )}
    </div>
  );
}
