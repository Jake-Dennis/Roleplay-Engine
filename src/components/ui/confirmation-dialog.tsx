"use client";
/**
 * ConfirmationDialog Component
 *
 * Modal dialog for confirming destructive or important actions.
 * Replaces native confirm() calls.
 *
 * Usage:
 *   <ConfirmationDialog
 *     open={showDelete}
 *     onClose={() => setShowDelete(false)}
 *     onConfirm={handleDelete}
 *     title="Delete Entry"
 *     message="Are you sure? This cannot be undone."
 *     confirmVariant="danger"
 *   />
 */

"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "default";
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "default",
}: ConfirmationDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
              confirmVariant === "danger" ? "bg-error/10" : "bg-accent/10"
            }`}
          >
            <AlertTriangle
              className={`h-4 w-4 ${
                confirmVariant === "danger" ? "text-error" : "text-accent"
              }`}
            />
          </div>
          <p className="text-sm text-text-secondary">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-border-default bg-bg-raised px-3.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white disabled:opacity-50 ${
              confirmVariant === "danger"
                ? "bg-error hover:bg-error/90"
                : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
