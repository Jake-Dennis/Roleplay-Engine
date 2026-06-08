'use client';

/**
 * MarkdownEditor — from-scratch wiki editor centerpiece.
 *
 * Renders a controlled <textarea> with a syntax-highlighted <pre> overlay, a
 * line-number gutter, and a wikilink autocomplete popup. The overlay and
 * textarea scroll together; the popup is driven by useWikilinkAutocomplete.
 *
 * No third-party dependencies. All visual styling lives in
 * editor-styles.css, which is imported here as a side-effect so the editor
 * can be dropped into any page without per-parent setup.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { FileText } from 'lucide-react';

import { highlightMarkdown } from '@/components/wiki/editor/syntax-highlighter';
import { useWikilinkAutocomplete } from '@/components/wiki/editor/use-wikilink-autocomplete';
import '@/components/wiki/editor/editor-styles.css';

export interface MarkdownEditorProps {
  /** Current value of the editor body (markdown, no frontmatter). */
  value: string;
  /** Called on every input change. */
  onChange: (next: string) => void;
  /** Optional save handler — bound to Cmd-S (or Ctrl-S). */
  onSave?: () => void;
  /** Existing wiki page paths/titles, used for wikilink autocomplete. */
  existingPages: string[];
  /** Optional placeholder text when the editor is empty. */
  placeholder?: string;
  /** Optional minimum height in lines. Default: 20. */
  minRows?: number;
  /** Read-only mode. Default: false. */
  readOnly?: boolean;
}

/**
 * Highlights the first case-insensitive occurrence of `query` inside `text`
 * by wrapping it in a <span class="wiki-autocomplete-match">. Renders as a
 * React child, so React handles HTML escaping for us.
 */
const HighlightedMatch = memo(function HighlightedMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <span className="wiki-autocomplete-match">{match}</span>
      {after}
    </>
  );
});

const MarkdownEditor = memo(function MarkdownEditor({
  value,
  onChange,
  onSave,
  existingPages,
  placeholder,
  minRows = 20,
  readOnly = false,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLPreElement>(null);

  // Compute the highlight overlay and gutter line count from value
  // directly during render (useMemo) rather than via effect + setState.
  // This avoids a synchronous render cascade (react-hooks/set-state-in-effect).
  const overlayHtml = useMemo(() => highlightMarkdown(value), [value]);
  const lineCount = useMemo(() => value.split('\n').length || 1, [value]);

  const wa = useWikilinkAutocomplete({
    textareaRef,
    pages: existingPages,
    limit: 10,
  });

  // When the parent swaps in a new value while the textarea is not focused
  // (e.g. user opened a different page in the editor), mirror the value
  // into the DOM. While focused, leave the DOM alone so we never clobber
  // an in-flight selection or insertion.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (document.activeElement === ta) return;
    if (ta.value === value) return;
    ta.value = value;
  }, [value]);

  // Keep the overlay in lockstep with the textarea's scroll position.
  const handleScroll = useCallback(() => {
    const ov = overlayRef.current;
    const ta = textareaRef.current;
    if (!ov || !ta) return;
    ov.scrollTop = ta.scrollTop;
    ov.scrollLeft = ta.scrollLeft;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Autocomplete hook gets first crack at the event — when the popup is
      // open it owns arrow keys, Enter, Tab, and Escape.
      if (wa.handleKeyDown(e)) return;

      // Cmd-S / Ctrl-S triggers save.
      if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSave?.();
        return;
      }

      // Tab inserts two spaces when no popup is open. (When a popup is open,
      // wa.handleKeyDown above already swallowed the Tab key.)
      if (e.key === 'Tab' && !e.shiftKey) {
        const ta = e.currentTarget;
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const insert = '  ';
        const newValue = value.slice(0, start) + insert + value.slice(end);
        onChange(newValue);
        // Restore cursor after the inserted spaces on the next frame, once
        // React has committed the new value back into the DOM.
        requestAnimationFrame(() => {
          const t = textareaRef.current;
          if (!t) return;
          t.selectionStart = start + insert.length;
          t.selectionEnd = start + insert.length;
        });
      }
    },
    [wa, onSave, onChange, value]
  );

  const lineNumbersText = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  }, [lineCount]);

  return (
    <div className="wiki-editor">
      <div className="wiki-editor-gutter" aria-hidden>
        {lineNumbersText}
      </div>
      <div className="wiki-editor-content">
        <pre
          ref={overlayRef}
          className="wiki-editor-overlay"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: overlayHtml }}
        />
        <textarea
          ref={textareaRef}
          className="wiki-editor-input"
          value={value}
          rows={minRows}
          placeholder={placeholder}
          readOnly={readOnly}
          spellCheck={false}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
        />
        {wa.open && (
          <div
            className="wiki-autocomplete"
            style={{
              top: wa.position?.top ?? 0,
              left: wa.position?.left ?? 0,
            }}
          >
            {wa.items.length === 0 ? (
              <div className="wiki-autocomplete-empty">No matches</div>
            ) : (
              wa.items.map((item, i) => (
                <div
                  key={item}
                  className="wiki-autocomplete-item"
                  data-active={i === wa.activeIndex}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    wa.acceptItem(item);
                  }}
                >
                  <FileText size={12} className="opacity-50" />
                  <HighlightedMatch text={item} query={wa.query} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default MarkdownEditor;
export { MarkdownEditor };
