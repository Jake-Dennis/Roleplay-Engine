"use client";

/**
 * PromotionDialog Component
 *
 * Dialog for moving entities between canon layers.
 * Shows current layer, target layer options, and requires confirmation
 * for promotion to immutable_canon.
 */

import { useState } from "react";
import { Lock, Shield, FileText, Clock, AlertTriangle, X } from "lucide-react";

const LAYER_OPTIONS = [
  { key: "immutable_canon", label: "Immutable Canon", icon: Lock, color: "text-error", bg: "bg-error/10", desc: "Cannot be edited. Highest authority." },
  { key: "soft_canon", label: "Soft Canon", icon: Shield, color: "text-accent", bg: "bg-accent/10", desc: "Established but can be expanded." },
  { key: "generated_lore", label: "Generated Lore", icon: FileText, color: "text-warning", bg: "bg-warning/10", desc: "AI-generated, needs review." },
  { key: "session_lore", label: "Session Lore", icon: Clock, color: "text-success", bg: "bg-success/10", desc: "Created during sessions." },
  { key: "rumor", label: "Rumor", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", desc: "Unverified, may be inaccurate." },
] as const;

interface PromotionDialogProps {
  open: boolean;
  currentLayer: string;
  entityName: string;
  entityType: string;
  onConfirm: (newLayer: string) => void;
  onClose: () => void;
}

export function PromotionDialog({
  open,
  currentLayer,
  entityName,
  entityType,
  onConfirm,
  onClose,
}: PromotionDialogProps) {
  const [selectedLayer, setSelectedLayer] = useState(currentLayer);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!open) return null;

  const currentOption = LAYER_OPTIONS.find((l) => l.key === currentLayer);
  const selectedOption = LAYER_OPTIONS.find((l) => l.key === selectedLayer);

  function handleConfirm() {
    if (selectedLayer === "immutable_canon" && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    onConfirm(selectedLayer);
    setShowConfirm(false);
    setSelectedLayer(currentLayer);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-elevated p-5 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Change Canon Layer</h3>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Entity info */}
        <div className="rounded-lg bg-bg-raised px-3 py-2 mb-4">
          <p className="text-xs text-text-primary font-medium">{entityName}</p>
          <p className="text-xxs text-text-muted capitalize">{entityType}</p>
        </div>

        {/* Current layer */}
        <div className="mb-3">
          <span className="text-xxs text-text-muted">Current:</span>
          <span className={`ml-1 text-xs font-medium ${currentOption?.color || "text-text-muted"}`}>
            {currentOption?.label || currentLayer}
          </span>
        </div>

        {/* Layer options */}
        <div className="space-y-1.5 mb-4">
          {LAYER_OPTIONS.map(({ key, label, icon: Icon, color, bg, desc }) => (
            <button
              key={key}
              onClick={() => { setSelectedLayer(key); setShowConfirm(false); }}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                selectedLayer === key
                  ? `${bg} ${color} border-current`
                  : "border-border-default bg-bg-base hover:bg-bg-raised"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xxs text-text-muted">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Immutable confirmation */}
        {showConfirm && selectedLayer === "immutable_canon" && (
          <div className="rounded-lg border border-error/20 bg-error/5 px-3 py-2 mb-4">
            <p className="text-xs text-error font-medium">⚠ This action cannot be undone</p>
            <p className="text-xxs text-text-muted mt-0.5">
              Immutable canon entities cannot be edited. Create a new entity instead if you need to make changes.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-bg-raised px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedLayer === currentLayer}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
              selectedLayer === "immutable_canon" && !showConfirm
                ? "bg-error hover:bg-error/80"
                : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {selectedLayer === "immutable_canon" && !showConfirm
              ? "Confirm Immutable"
              : "Update Layer"}
          </button>
        </div>
      </div>
    </div>
  );
}
