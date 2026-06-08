'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Expand, AlignLeft, Wand2 } from 'lucide-react';

interface SelectionToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

type Action = 'rewrite' | 'expand' | 'summarize' | 'improve';

interface ToolbarState {
  visible: boolean;
  top: number;
  left: number;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
}

const ACTION_LABELS: Record<Action, { label: string; icon: typeof Sparkles; endpoint: string }> = {
  rewrite: { label: 'Rewrite', icon: Wand2, endpoint: '/api/wiki/text/rewrite' },
  expand: { label: 'Expand', icon: Expand, endpoint: '/api/wiki/text/expand' },
  summarize: { label: 'Summarize', icon: AlignLeft, endpoint: '/api/wiki/text/summarize' },
  improve: { label: 'Improve', icon: Sparkles, endpoint: '/api/wiki/text/improve' },
};

/**
 * Floating selection toolbar for AI-powered text operations.
 * Appears when the user selects text in the MarkdownEditor textarea.
 * Provides Rewrite, Expand, Summarize, and Improve actions.
 */
export default function SelectionToolbar({
  textareaRef,
  value,
  onChange,
  className = '',
}: SelectionToolbarProps) {
  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: false,
    top: 0,
    left: 0,
    selectedText: '',
    selectionStart: 0,
    selectionEnd: 0,
  });
  const [loading, setLoading] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track selection changes on the textarea
  const handleSelectionChange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);

    if (start === end || !selected.trim()) {
      // Schedule hiding the toolbar (delayed so click events on toolbar fire first)
      hideTimeoutRef.current = setTimeout(() => {
        setToolbar((prev) => ({ ...prev, visible: false }));
      }, 200);
      return;
    }

    // Calculate position relative to the textarea
    const rect = ta.getBoundingClientRect();
    const textStyle = window.getComputedStyle(ta);
    const lineHeight = parseInt(textStyle.lineHeight, 10) || 20;
    const paddingTop = parseInt(textStyle.paddingTop, 10) || 0;
    const paddingLeft = parseInt(textStyle.paddingLeft, 10) || 0;

    // Approximate cursor position based on character offset
    const textBefore = value.slice(0, start);
    const lines = textBefore.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length;

    const top = rect.top + paddingTop + (line - 1) * lineHeight - 40;
    const left = rect.left + paddingLeft + Math.min(col * 8, rect.width - 200);

    setToolbar({
      visible: true,
      top: Math.max(top, window.scrollY + 8),
      left: Math.max(left, 8),
      selectedText: selected,
      selectionStart: start,
      selectionEnd: end,
    });
    setError(null);
  }, [textareaRef, value]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.addEventListener('mouseup', handleSelectionChange);
    ta.addEventListener('keyup', handleSelectionChange);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      ta.removeEventListener('mouseup', handleSelectionChange);
      ta.removeEventListener('keyup', handleSelectionChange);
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [textareaRef, handleSelectionChange]);

  // Prevent toolbar from hiding when clicking inside it
  const handleToolbarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleAction = useCallback(
    async (action: Action) => {
      const { selectedText, selectionStart, selectionEnd } = toolbar;
      if (!selectedText) return;

      setLoading(action);
      setError(null);

      try {
        const endpoint = ACTION_LABELS[action].endpoint;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: selectedText }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: `${action} failed` }));
          throw new Error(errBody.error || `${action} failed`);
        }

        const data = await res.json();
        const newText = data.result || '';

        // Replace the selected text in the editor
        const before = value.slice(0, selectionStart);
        const after = value.slice(selectionEnd);
        const updated = before + newText + after;
        onChange(updated);

        // Hide the toolbar
        setToolbar((prev) => ({ ...prev, visible: false }));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : `${action} failed`);
      } finally {
        setLoading(null);
      }
    },
    [toolbar, value, onChange]
  );

  if (!toolbar.visible) return null;

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-[100] p-3 rounded-lg bg-error/10 border border-error/20 shadow-lg max-w-xs">
          <p className="text-error text-xs">{error}</p>
        </div>
      )}
      <div
        ref={toolbarRef}
        className={`fixed z-[60] flex items-center gap-0.5 px-1.5 py-1 rounded-lg border border-border-default bg-bg-elevated shadow-xl ${className}`}
        style={{ top: toolbar.top, left: toolbar.left }}
        onMouseDown={handleToolbarMouseDown}
      >
        {(Object.entries(ACTION_LABELS) as [Action, typeof ACTION_LABELS[Action]][])
          .filter(([, config]) => config.endpoint !== '/api/wiki/text/summarize' || toolbar.selectedText.length > 50)
          .map(([action, config]) => {
            const Icon = config.icon;
            const isActive = loading === action;
            return (
              <button
                key={action}
                onClick={() => handleAction(action)}
                disabled={loading !== null}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                  isActive
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-secondary hover:bg-bg-raised hover:text-text-primary'
                }`}
                title={config.label}
              >
                <Icon size={12} className={isActive ? 'animate-spin' : ''} />
                <span>{config.label}</span>
              </button>
            );
          })}
      </div>
    </>
  );
}
