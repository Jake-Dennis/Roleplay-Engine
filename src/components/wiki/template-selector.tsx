"use client";
import { useState, useEffect } from "react";
import { X, FileText, Users, BookOpen, MapPin, Calendar, Lightbulb, Loader2 } from "lucide-react";

export interface WikiTemplate {
  name: string;
  title: string;
  type: string;
  preview: string;
  content: string;
}

interface TemplateSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: WikiTemplate) => void;
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  entity: Users,
  concept: BookOpen,
};

const TEMPLATE_ICONS: Record<string, typeof FileText> = {
  character: Users,
  location: MapPin,
  faction: Users,
  event: Calendar,
  concept: Lightbulb,
};

export default function TemplateSelector({ open, onClose, onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<WikiTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/wiki/templates")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load templates");
        return res.json();
      })
      .then((data) => {
        setTemplates(data.templates || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-bg-elevated border border-border-default rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h2 className="text-lg font-semibold text-text-primary">
            Create from Template
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-highlight text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <Loader2 size={24} className="animate-spin mb-2" />
              <p className="text-sm">Loading templates...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-error/10 border border-error/20">
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && templates.length === 0 && (
            <p className="text-center text-text-muted py-8 text-sm">
              No templates available.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3">
            {templates.map((template) => {
              const Icon = TEMPLATE_ICONS[template.name] || TYPE_ICONS[template.type] || FileText;
              return (
                <button
                  key={template.name}
                  onClick={() => onSelect(template)}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border-default bg-bg-base hover:bg-bg-raised hover:border-accent/30 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary text-sm">
                      {template.preview}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 capitalize">
                      {template.type} &middot; {template.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
