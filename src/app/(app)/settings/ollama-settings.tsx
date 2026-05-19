"use client";

import { Cpu, Sparkles, Check, AlertCircle, RefreshCw, Save } from "lucide-react";

interface OllamaModel {
  name: string;
  parameterSize: string;
  family: string;
}

interface OllamaEmbeddingModel {
  name: string;
  parameterSize: string;
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
  };
}

interface OllamaSettingsProps {
  // State
  ollamaConnected: boolean;
  llmModels: OllamaModel[];
  embeddingModels: OllamaEmbeddingModel[];
  localModels: string[];
  selectedLLM: string;
  setSelectedLLM: (v: string) => void;
  selectedEmbedding: string;
  setSelectedEmbedding: (v: string) => void;
  modelLoading: boolean;
  modelSaving: boolean;
  modelSaved: boolean;
  modelError: string;
  settings: ServerSettings | null;
  // Handlers
  handleRefreshModels: () => Promise<void>;
  handleModelSave: () => Promise<void>;
}

export function OllamaSettingsSection({
  ollamaConnected,
  llmModels,
  embeddingModels,
  localModels,
  selectedLLM,
  setSelectedLLM,
  selectedEmbedding,
  setSelectedEmbedding,
  modelLoading,
  modelSaving,
  modelSaved,
  modelError,
  settings,
  handleRefreshModels,
  handleModelSave,
}: OllamaSettingsProps) {
  function isModelLocallyAvailable(modelName: string): boolean {
    if (localModels.length === 0) return true; // Unknown state, assume available
    return localModels.includes(modelName) || localModels.some(m => m.startsWith(modelName + ":"));
  }

  return (
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
                    {m.name} ({m.parameterSize}) {isLocal ? "\u2713" : "\u26A0 not local"}
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
  );
}
