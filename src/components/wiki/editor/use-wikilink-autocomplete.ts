'use client';

/**
 * useWikilinkAutocomplete Hook
 *
 * Drives a "[[Page]]" suggestion popup on top of a textarea in the wiki editor.
 * Pure helpers from ./wikilink-autocomplete do the parsing/scoring work; this
 * hook glues them to the DOM via input/selection events and exposes a small
 * state machine for the parent component to render.
 *
 *   const wa = useWikilinkAutocomplete({ textareaRef, pages });
 *   <textarea onKeyDown={wa.handleKeyDown} ... />
 *   {wa.open && <Popup position={wa.position} items={wa.items} ... />}
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  findWikilinkContext,
  filterPages,
  getCursorCoordinates,
  type PopupPosition,
} from './wikilink-autocomplete';

export interface UseWikilinkAutocompleteOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  pages: string[];
  limit?: number;
}

export interface UseWikilinkAutocompleteResult {
  open: boolean;
  position: PopupPosition | null;
  items: string[];
  activeIndex: number;
  query: string;
  isEmbed: boolean;
  setActiveIndex: (i: number) => void;
  acceptItem: (item: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

const TEXTAREA_EVENTS = ['input', 'select', 'click', 'keyup'] as const;

export function useWikilinkAutocomplete(
  options: UseWikilinkAutocompleteOptions
): UseWikilinkAutocompleteResult {
  const { textareaRef, pages, limit = 10 } = options;

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [isEmbed, setIsEmbed] = useState(false);

  const recompute = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) {
      setOpen(false);
      return;
    }
    const ctx = findWikilinkContext(ta.value, ta.selectionStart);
    if (!ctx || !ctx.cursorInside) {
      setOpen(false);
      return;
    }
    const filtered = filterPages(pages, ctx.query, limit);
    if (filtered.length === 0) {
      setOpen(false);
      return;
    }
    setQuery(ctx.query);
    setIsEmbed(ctx.isEmbed);
    setItems(filtered);
    setActiveIndex(0);
    setOpen(true);
    try {
      setPosition(getCursorCoordinates(ta, ta.selectionStart));
    } catch {
      // Mirror div failed (e.g. detached DOM) — leave the last known position.
    }
  }, [textareaRef, pages, limit]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    for (const ev of TEXTAREA_EVENTS) {
      ta.addEventListener(ev, recompute);
    }
    document.addEventListener('selectionchange', recompute);

    return () => {
      for (const ev of TEXTAREA_EVENTS) {
        ta.removeEventListener(ev, recompute);
      }
      document.removeEventListener('selectionchange', recompute);
    };
  }, [textareaRef, recompute]);

  const acceptItem = useCallback(
    (item: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const ctx = findWikilinkContext(ta.value, ta.selectionStart);
      if (!ctx) return;

      const openPart = ta.value.substring(0, ctx.openBracketPos);
      // The tail starts after the existing "]]" (if present) so we don't
      // double-append; otherwise it starts at the cursor.
      const tail =
        ctx.closeBracketPos !== null
          ? ta.value.substring(ctx.closeBracketPos)
          : ta.value.substring(ta.selectionStart);

      const insert = `${ctx.isEmbed ? '!' : ''}[[${item}]]`;
      const newValue = openPart + insert + tail;

      // Mutate via the native value setter so React's onChange fires when we
      // dispatch the input event below.
      const proto = Object.getPrototypeOf(ta) as object;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {
        desc.set.call(ta, newValue);
      } else {
        ta.value = newValue;
      }

      const newCursor = openPart.length + insert.length;
      ta.setSelectionRange(newCursor, newCursor);
      ta.dispatchEvent(new Event('input', { bubbles: true }));

      setOpen(false);
    },
    [textareaRef]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open || items.length === 0) return false;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % items.length);
          return true;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        case 'Enter':
        case 'Tab': {
          e.preventDefault();
          const choice = items[activeIndex];
          if (choice !== undefined) acceptItem(choice);
          return true;
        }
        case 'Escape': {
          e.preventDefault();
          setOpen(false);
          return true;
        }
        default:
          return false;
      }
    },
    [open, items, activeIndex, acceptItem]
  );

  return useMemo(
    () => ({
      open,
      position,
      items,
      activeIndex,
      query,
      isEmbed,
      setActiveIndex,
      acceptItem,
      handleKeyDown,
    }),
    [open, position, items, activeIndex, query, isEmbed, acceptItem, handleKeyDown]
  );
}
