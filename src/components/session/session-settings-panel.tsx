"use client";

import { useState, useEffect } from "react";
import { X, Settings, RotateCcw } from "lucide-react";

interface SessionSettings {
  llmModel: string | null;
  embeddingModel: string | null;
  temperature: number | null;
  topP: number | null;
  numCtx: number | null;
  systemPrompt: string | null;
  maxResponseLength: number | null;
}

interface SessionSettingsPanelProps {
  sessionId: string;
  onClose: () => void;
}

const DEFAULTS = {
  llmModel: "",
  embeddingModel: "",
  temperature: 0.7,
  topP: 0.9,
  numCtx: 4096,
  systemPrompt: "",
  maxResponseLength: 2048,
};

export function SessionSettingsPanel({ sessionId, onClose }: SessionSettingsPanelProps) {
  const [settings, setSettings] = useState<SessionSettings>({
    llmModel: null,
    embeddingModel: null,
    temperature: null,
    topP: null,
    numCtx: null,
    systemPrompt: null,
    maxResponseLength: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/settings`)
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/ollama/models")
      .then((res) => res.json())
      .then((data) => setAvailableModels(data.models || []))
      .catch(() => {});
  }, [sessionId]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/sessions/${sessionId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    onClose();
  }

  function handleReset() {
    setSettings({
      llmModel: null,
      embeddingModel: null,
      temperature: null,
      topP: null,
      numCtx: null,
      systemPrompt: null,
      maxResponseLength: null,
    });
  }

  function val<T>(v: T | null, fallback: T): T {
    return v !== null && v !== undefined ? v : fallback;
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border-default bg-bg-elevated p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-text-muted" />
            <h3 className="text-xs font-semibold text-text-primary">Session Settings</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-bg-raised">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 animate-pulse text-xxs text-text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-default bg-bg-elevated">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-text-muted" />
          <h3 className="text-xs font-semibold text-text-primary">Session Settings</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
            title="Reset to defaults"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 px-4 py-4">
        {/* LLM Model */}
        <div>
          <label className="mb-1 block text-xxs font-medium text-text-muted">LLM Model</label>
          <select
            value={settings.llmModel || ""}
            onChange={(e) => setSettings({ ...settings, llmModel: e.target.value || null })}
            className="w-full rounded-md border border-border-default bg-bg-base px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">Use user default</option>
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Embedding Model */}
        <div>
          <label className="mb-1 block text-xxs font-medium text-text-muted">Embedding Model</label>
          <select
            value={settings.embeddingModel || ""}
            onChange={(e) => setSettings({ ...settings, embeddingModel: e.target.value || null })}
            className="w-full rounded-md border border-border-default bg-bg-base px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">Use user default</option>
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Temperature */}
        <div>
          <label className="mb-1 block text-xxs font-medium text-text-muted">
            Temperature: {val(settings.temperature, DEFAULTS.temperature).toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={val(settings.temperature, DEFAULTS.temperature)}
            onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        {/* Top P */}
        <div>
          <label className="mb-1 block text-xxs font-medium text-text-muted">
            Top P: {val(settings.topP, DEFAULTS.topP).toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={val(settings.topP, DEFAULTS.topP)}
            onChange={(e) => setSettings({ ...settings, topP: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        {/* Context Size */}
        <div>
          <label className="mb-1 block text-xxs font-medium text-text-muted">Context Size</label>
          <select
            value={val(settings.numCtx, DEFAULTS.numCtx)}
            onChange={(e) => setSettings({ ...settings, numCtx: parseInt(e.target.value, 10) })}
            className="w-full rounded-md border border-border-default bg-bg-base px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={2048}>2048</option>
            <option value={4096}>4096</option>
            <option value={8192}>8192</option>
            <option value={16384}>16384</option>
            <option value={32768}>32768</option>
          </select>
        </div>

        {/* Max Response Length */}
        <div>
          <label className="mb-1 block text-xxs font-medium text-text-muted">Max Response Length (tokens)</label>
          <input
            type="number"
            min="256"
            max="8192"
            step="256"
            value={val(settings.maxResponseLength, DEFAULTS.maxResponseLength)}
            onChange={(e) => setSettings({ ...settings, maxResponseLength: parseInt(e.target.value, 10) })}
            className="w-full rounded-md border border-border-default bg-bg-base px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          />
        </div>

        {/* System Prompt */}
        <div>
          <label className="mb-1 block text-xxs font-medium text-text-muted">System Prompt</label>
          <textarea
            value={settings.systemPrompt || ""}
            onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value || null })}
            placeholder="Leave empty to use default..."
            rows={4}
            className="w-full rounded-md border border-border-default bg-bg-base px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-border-default px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-raised"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-accent px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
