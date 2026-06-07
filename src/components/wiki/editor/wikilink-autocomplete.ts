/**
 * Wikilink autocomplete helpers (pure functions).
 *
 * Used by the from-scratch wiki editor to drive a "[[Page]]" suggestion popup.
 * Server-safe: no React, no JSX, no module-level mutable state. Browser APIs
 * (window, document) are only touched by getCursorCoordinates.
 *
 * Zero third-party dependencies.
 */

export interface WikilinkContext {
  /** Position of the opening "[[" in the text (or null if not inside one). */
  openBracketPos: number;
  /** Position immediately after the closing "]]" if it exists, or null. */
  closeBracketPos: number | null;
  /** The partial page title text between the brackets (no alias/embed markers). */
  query: string;
  /** True if this is an embed wikilink (starts with "!"). */
  isEmbed: boolean;
  /** True if the cursor is currently inside the wikilink. */
  cursorInside: boolean;
}

/**
 * Inspect the text around the cursor and return the active wikilink context, or
 * null if the cursor is not inside (or immediately after) a [[...]] pair.
 */
export function findWikilinkContext(
  text: string,
  cursorPos: number
): WikilinkContext | null {
  const cursor = Math.max(0, Math.min(cursorPos, text.length));

  // Locate the current line in the text. The line containing the cursor is
  // bounded by the previous newline (inclusive) and the next newline (exclusive).
  const prevNewline = text.lastIndexOf('\n', cursor - 1);
  const lineStart = prevNewline === -1 ? 0 : prevNewline + 1;
  const nextNewline = text.indexOf('\n', cursor);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const line = text.slice(lineStart, lineEnd);
  const cursorInLine = cursor - lineStart;

  // Quick reject: no opening brackets on this line at all.
  if (!line.includes('[[')) return null;

  // Find the LAST "[[" on the current line at or before the cursor.
  const searchRange = line.slice(0, cursorInLine);
  const lastDoubleOpen = searchRange.lastIndexOf('[[');
  if (lastDoubleOpen === -1) return null;

  // Detect embed marker: "![[". Count preceding backslashes to honor "\!" escapes.
  let isEmbed = false;
  let openBracketPos = lineStart + lastDoubleOpen;
  if (lastDoubleOpen > 0 && line[lastDoubleOpen - 1] === '!') {
    let backslashCount = 0;
    let i = lastDoubleOpen - 2;
    while (i >= 0 && line[i] === '\\') {
      backslashCount++;
      i--;
    }
    if (backslashCount % 2 === 0) {
      isEmbed = true;
      openBracketPos = lineStart + lastDoubleOpen - 1;
    }
  }

  // Find the next "]]" after the "[[".
  const contentStart = lineStart + lastDoubleOpen + 2;
  const afterOpen = text.slice(contentStart);
  const closeRel = afterOpen.indexOf(']]');
  const closeBracketStart = closeRel === -1 ? null : contentStart + closeRel;
  const closeBracketEnd = closeRel === -1 ? null : contentStart + closeRel + 2;

  // Determine whether the cursor sits inside the wikilink and slice the query.
  let cursorInside: boolean;
  let query: string;
  if (closeBracketEnd !== null && cursor >= closeBracketEnd) {
    cursorInside = false;
    query = text.slice(contentStart, closeBracketStart ?? contentStart);
  } else {
    cursorInside = true;
    const queryEnd =
      closeBracketStart !== null && cursor >= closeBracketStart
        ? closeBracketStart
        : cursor;
    query = text.slice(contentStart, queryEnd);
  }

  return {
    openBracketPos,
    closeBracketPos: closeBracketEnd,
    query,
    isEmbed,
    cursorInside,
  };
}

/**
 * Score and rank page titles against the typed query.
 *   - exact title match           -> 100
 *   - title starts with query     ->  50
 *   - title contains query (ci)   ->  10
 *   - otherwise                   ->   0 (excluded)
 * Returns the top `limit` results (default 10) in score-descending order.
 * Strips stray [[, ]], and ![[ wrappers from page names defensively.
 */
export function filterPages(
  pages: string[],
  query: string,
  limit = 10
): string[] {
  const q = query.trim().toLowerCase();

  if (q === '') {
    return pages.slice(0, limit).map(normalizePageName);
  }

  const scored: Array<{ page: string; score: number }> = [];

  for (const raw of pages) {
    const page = normalizePageName(raw);
    if (page === '') continue;

    const p = page.toLowerCase();
    let score = 0;
    if (p === q) score = 100;
    else if (p.startsWith(q)) score = 50;
    else if (p.includes(q)) score = 10;

    if (score > 0) scored.push({ page, score });
  }

  scored.sort((a, b) => b.score - a.score || a.page.localeCompare(b.page));
  return scored.slice(0, limit).map((s) => s.page);
}

function normalizePageName(raw: string): string {
  let name = raw.trim();
  if (name.startsWith('!')) name = name.slice(1);
  if (name.startsWith('[[')) name = name.slice(2);
  if (name.endsWith(']]')) name = name.slice(0, -2);
  return name.trim();
}

export interface PopupPosition {
  /** Pixels from the top of the viewport. */
  top: number;
  /** Pixels from the left of the viewport. */
  left: number;
}

/**
 * Compute the viewport coordinates of the cursor in a textarea using the
 * well-known mirror-div technique. The textarea is replicated in an off-screen
 * <div> that shares its font, padding, border, and line-height; the cursor is
 * represented by an inline <span> at the end of the substring preceding the
 * cursor. The span's offsetTop/offsetLeft (relative to the mirror) give the
 * cursor's position within the text content.
 */
export function getCursorCoordinates(
  textarea: HTMLTextAreaElement,
  cursorPos: number
): PopupPosition {
  const computed = window.getComputedStyle(textarea);

  // Properties that must match between the textarea and the mirror for the
  // measurement to be accurate. Anything that affects glyph layout or box shape.
  const mirrorProps = [
    'boxSizing',
    'width',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'direction',
  ];

  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.top = '0';
  div.style.left = '0';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.overflowWrap = 'break-word';

  for (const prop of mirrorProps) {
    const value = computed.getPropertyValue(prop);
    if (value) div.style.setProperty(prop, value);
  }

  // Width: textarea.clientWidth is the inner box (content + padding) excluding
  // scrollbar. Force border-box on the mirror so width is interpreted as outer
  // width and the inner content area matches the textarea's content area.
  div.style.boxSizing = 'border-box';
  div.style.width = `${textarea.clientWidth}px`;

  // Replicate the text up to the cursor; the trailing span marks the cursor
  // position. A zero-width space ensures the span has a measurable line box.
  div.textContent = textarea.value.substring(0, cursorPos);

  const span = document.createElement('span');
  span.textContent = '\u200b';
  div.appendChild(span);

  // Append to the body for measurement, then remove immediately.
  document.body.appendChild(div);

  const rect = textarea.getBoundingClientRect();
  const borderTop = parseFloat(computed.getPropertyValue('border-top-width')) || 0;
  const borderLeft = parseFloat(computed.getPropertyValue('border-left-width')) || 0;

  // The span's offsetTop is measured from the mirror's padding edge, which
  // mirrors the textarea's content area (padding included, border excluded).
  // The textarea's own border width and any internal scroll offset must be
  // applied here to land on the actual rendered cursor location.
  const top =
    rect.top + span.offsetTop + borderTop - textarea.scrollTop;
  const left =
    rect.left + span.offsetLeft + borderLeft - textarea.scrollLeft;

  document.body.removeChild(div);

  return { top, left };
}
