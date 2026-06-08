'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { Modal } from '@/components/ui/modal';
import { Sparkles, Loader2 } from 'lucide-react';

interface CreateFromPromptModalProps {
  open: boolean;
  onClose: () => void;
  universeId?: string;
  onCreated?: (path: string) => void;
}

interface TypeConfig {
  name: string;
  subtypes: string[];
}

/**
 * Modal that lets a user describe a wiki page in natural language,
 * then uses the LLM to generate the full page content and frontmatter.
 */
export default function CreateFromPromptModal({
  open,
  onClose,
  universeId,
  onCreated,
}: CreateFromPromptModalProps) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<TypeConfig[]>([]);
  const [selectedType, setSelectedType] = useState('concept');
  const [selectedSubtype, setSelectedSubtype] = useState('');

  useEffect(() => {
    if (!open) return;
    setPrompt('');
    setError(null);
    setSelectedType('concept');
    setSelectedSubtype('');

    fetch(`/api/wiki/config?universe_id=${universeId || ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.types) {
          const configs: TypeConfig[] = Object.entries(data.types).map(
            ([key, val]: [string, unknown]) => ({
              name: key,
              subtypes: (val as { subtypes: string[] }).subtypes || [],
            })
          );
          setTypes(configs);
        }
      })
      .catch(() => {
        // Non-critical; use defaults
      });
  }, [open, universeId]);

  const currentSubtypes =
    types.find((t) => t.name === selectedType)?.subtypes || [];
  const canGenerate = prompt.trim().length > 0 && !generating;

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!canGenerate) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/wiki/text/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          universeId,
          type: selectedType,
          subtype: selectedSubtype || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(errBody.error || 'Generation failed');
      }

      const data = await res.json();
      onCreated?.(data.path);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Page from Prompt" size="lg">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <label htmlFor="prompt-text" className="block text-xs font-medium text-text-secondary mb-1.5">
            Describe the wiki page to create
          </label>
          <textarea
            id="prompt-text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A mysterious forest on the edge of the kingdom, home to ancient spirits and guarded by giant owls..."
            rows={5}
            autoFocus
            disabled={generating}
            className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border-default text-sm text-text-primary focus:border-accent focus:outline-none placeholder:text-text-muted resize-none disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="page-type" className="block text-xs font-medium text-text-secondary mb-1">
              Type
            </label>
            <select
              id="page-type"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setSelectedSubtype('');
              }}
              disabled={generating}
              className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border-default text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
            >
              {types.length === 0 ? (
                <>
                  <option value="entity">Entity</option>
                  <option value="concept">Concept</option>
                </>
              ) : (
                types.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name.charAt(0).toUpperCase() + t.name.slice(1)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label htmlFor="page-subtype" className="block text-xs font-medium text-text-secondary mb-1">
              Subtype (optional)
            </label>
            <select
              id="page-subtype"
              value={selectedSubtype}
              onChange={(e) => setSelectedSubtype(e.target.value)}
              disabled={generating || currentSubtypes.length === 0}
              className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border-default text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="">None</option>
              {currentSubtypes.map((st) => (
                <option key={st} value={st}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-error/10 border border-error/20">
            <p className="text-error text-xs">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-raised transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canGenerate}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-text-primary text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={12} />
                Generate
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
