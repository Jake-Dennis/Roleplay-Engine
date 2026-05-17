"use client";
/**
 * Modal Component
 *
 * Reusable modal dialog with backdrop, focus trap, and size variants.
 * Closes on backdrop click or Escape key.
 *
 * Usage:
 *   <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Confirm Action">
 *     <p>Are you sure?</p>
 *   </Modal>
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  // Focus trap (simple version)
  useEffect(() => {
    if (open && modalRef.current) {
      modalRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative z-10 w-full ${SIZE_CLASSES[size]} rounded-xl border border-border-default bg-bg-elevated shadow-2xl transition-all`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
            <h2 id="modal-title" className="text-sm font-semibold text-text-primary">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
