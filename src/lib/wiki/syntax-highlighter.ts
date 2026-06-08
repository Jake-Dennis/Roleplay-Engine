/**
 * Pure-function markdown syntax highlighter for the wiki editor.
 *
 * Tokenizes raw markdown text into HTML with <span class="tok-..."> wrappers.
 * The result is rendered via dangerouslySetInnerHTML in the editor.
 *
 * Guarantees:
 *   - XSS-safe: every text portion is HTML-escaped; only <span> tags are raw.
 *   - Server-safe: no browser APIs, no async, no I/O.
 *   - Pure: no module-level mutable state, deterministic for a given input.
 *   - Zero third-party dependencies: only standard JavaScript regex.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Inline regex patterns
// ---------------------------------------------------------------------------

const RE_INLINE_CODE = /`[^`\n]+`/g;
const RE_ESCAPE = /\\([\\`*_{}\[\]()#+\-.!>~|])/g;
const RE_EMBED_WIKILINK = /!\[\[([^\]\n]+?)\]\]/g;
const RE_WIKILINK = /\[\[([^\]\n]+?)\]\]/g;
const RE_IMAGE = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
const RE_LINK = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
const RE_BOLD = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g;
const RE_STRIKE = /~~([^~\n]+?)~~/g;
// Italic must NOT match `*`s that belong to a `**bold**` region. The lookbehind
// and lookahead guard against consuming one half of a `**` pair. This prevents
// `*italic*` from being silently dropped when it appears right after `**bold**`
// (the trailing `*` of the bold run would otherwise be re-used as the opening
// `*` of a bogus `* and *` italic match that then shadows the real italic).
const RE_ITALIC = /(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)([^_\n]+?)(?<!_)_(?!_)/g;
const RE_TAG = /(?:^|[\s,(\[])#[a-zA-Z][a-zA-Z0-9_\-/]*/g;

type InlineMatch = { start: number; end: number; rendered: string };

// ---------------------------------------------------------------------------
// Inline render functions (turn one regex match into HTML)
// ---------------------------------------------------------------------------

function renderInlineCode(m: RegExpExecArray): string {
  return `<span class="tok-code">${escapeHtml(m[0])}</span>`;
}

function renderEscape(m: RegExpExecArray): string {
  return `<span class="tok-escape">${escapeHtml('\\' + m[1])}</span>`;
}

function renderEmbed(m: RegExpExecArray): string {
  return `<span class="tok-embed">${escapeHtml(m[0])}</span>`;
}

function renderWikilink(m: RegExpExecArray): string {
  return `<span class="tok-wikilink">${escapeHtml(m[0])}</span>`;
}

function renderImage(m: RegExpExecArray): string {
  // Split: ! [ alt ] ( url ) — alt and url get distinct classes, brackets are plain.
  return (
    escapeHtml('![') +
    `<span class="tok-image-alt">${escapeHtml(m[1])}</span>` +
    escapeHtml('](') +
    `<span class="tok-image-url">${escapeHtml(m[2])}</span>` +
    escapeHtml(')')
  );
}

function renderLink(m: RegExpExecArray): string {
  return (
    escapeHtml('[') +
    `<span class="tok-link-text">${escapeHtml(m[1])}</span>` +
    escapeHtml('](') +
    `<span class="tok-link-url">${escapeHtml(m[2])}</span>` +
    escapeHtml(')')
  );
}

function renderBold(m: RegExpExecArray): string {
  return `<span class="tok-bold">${escapeHtml(m[0])}</span>`;
}

function renderStrike(m: RegExpExecArray): string {
  return `<span class="tok-strike">${escapeHtml(m[0])}</span>`;
}

function renderItalic(m: RegExpExecArray): string {
  return `<span class="tok-italic">${escapeHtml(m[0])}</span>`;
}

function renderTag(m: RegExpExecArray): string {
  // The tag regex captures a leading boundary char (whitespace, comma, paren,
  // bracket, or line start). Keep the boundary as plain text; only #name in span.
  if (m.index === 0) {
    return `<span class="tok-tag">${escapeHtml(m[0])}</span>`;
  }
  return (
    escapeHtml(m[0][0]) +
    `<span class="tok-tag">${escapeHtml(m[0].slice(1))}</span>`
  );
}

const INLINE_PATTERNS: ReadonlyArray<{
  regex: RegExp;
  render: (m: RegExpExecArray) => string;
}> = [
  { regex: RE_INLINE_CODE, render: renderInlineCode },
  { regex: RE_ESCAPE, render: renderEscape },
  { regex: RE_EMBED_WIKILINK, render: renderEmbed },
  { regex: RE_WIKILINK, render: renderWikilink },
  { regex: RE_IMAGE, render: renderImage },
  { regex: RE_LINK, render: renderLink },
  { regex: RE_BOLD, render: renderBold },
  { regex: RE_STRIKE, render: renderStrike },
  { regex: RE_ITALIC, render: renderItalic },
  { regex: RE_TAG, render: renderTag },
];

// ---------------------------------------------------------------------------
// Inline tokenization: find all matches, resolve overlaps, emit spans + gaps
// ---------------------------------------------------------------------------

function findInlineMatches(line: string): InlineMatch[] {
  const matches: InlineMatch[] = [];

  for (const { regex, render } of INLINE_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      if (m[0].length === 0) {
        // Guard against zero-width matches to prevent infinite loops.
        regex.lastIndex++;
        continue;
      }
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        rendered: render(m),
      });
    }
  }

  // Sort by start ascending, then by end descending (prefer longer match at same start).
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Drop any match that overlaps a previously kept match.
  const filtered: InlineMatch[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  return filtered;
}

function tokenizeInline(line: string): string {
  const matches = findInlineMatches(line);
  let out = '';
  let pos = 0;
  for (const m of matches) {
    if (m.start > pos) {
      out += escapeHtml(line.slice(pos, m.start));
    }
    out += m.rendered;
    pos = m.end;
  }
  if (pos < line.length) {
    out += escapeHtml(line.slice(pos));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block-level processing: per-line state machine
// ---------------------------------------------------------------------------

type State = {
  inFencedCode: boolean;
  inFrontmatter: boolean;
  frontmatterSeen: boolean;
  fenceMarker: string;
  lineIndex: number;
};

function processLine(rawLine: string, state: State, allLines?: string[]): string {
  // Normalize line endings — strip a trailing \r so \r\n input still works.
  const line = rawLine.replace(/\r$/, '');

  // 1. Inside a fenced code block: emit content, watch for closing fence.
  if (state.inFencedCode) {
    const escapedMarker = escapeRegex(state.fenceMarker);
    const closeRe = new RegExp(`^\\s*${escapedMarker}{3,}\\s*$`);
    if (closeRe.test(line)) {
      state.inFencedCode = false;
      return `<span class="tok-code-block">${escapeHtml(line)}</span>\n`;
    }
    return `<span class="tok-code-content">${escapeHtml(line)}</span>\n`;
  }

  // 2. Opening fence (``` or ~~~) — also handles indented fences.
  const openFence = line.match(/^(\s*)(`{3,}|~{3,})/);
  if (openFence) {
    state.inFencedCode = true;
    state.fenceMarker = openFence[2][0];
    return `<span class="tok-code-block">${escapeHtml(line)}</span>\n`;
  }

  // 3. Frontmatter: only valid at the very top of the document, AND only if
  // a matching closing `---` appears within a reasonable distance. A lone
  // `---` with nothing after it is a horizontal rule, not a frontmatter
  // opener. We peek ahead through the next 100 lines for a closing fence.
  if (
    state.lineIndex === 0 &&
    !state.frontmatterSeen &&
    line.trim() === '---'
  ) {
    const hasClose = (allLines ?? [])
      .slice(1, 101)
      .some(l => l.replace(/\r$/, '').trim() === '---');
    if (hasClose) {
      state.inFrontmatter = true;
      state.frontmatterSeen = true;
      return `<span class="tok-fm-delim">${escapeHtml(line)}</span>\n`;
    }
    // Fall through — lone `---` is a horizontal rule.
  }
  if (state.inFrontmatter) {
    if (line.trim() === '---') {
      state.inFrontmatter = false;
      return `<span class="tok-fm-delim">${escapeHtml(line)}</span>\n`;
    }
    return `<span class="tok-fm-content">${escapeHtml(line)}</span>\n`;
  }

  // 4. Horizontal rule: ---, ***, ___, or spaced variants like - - -.
  // Note: \1 inside a character class would be treated as octal \u0001 in JS,
  // so we use a non-capturing alternation (?:s|\1) to match "same char as capture".
  if (/^([-*_])\s*\1\s*\1(?:\s|\1)*$/.test(line)) {
    return `<span class="tok-hr">${escapeHtml(line)}</span>\n`;
  }

  // 5. Heading 1-6: # through ###### followed by a space.
  const heading = line.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    const level = heading[1].length;
    return (
      `<span class="tok-h${level}">` +
      `${escapeHtml(heading[1])} ${tokenizeInline(heading[2])}` +
      `</span>\n`
    );
  }

  // 6. Callout: > [!type] [optional title]
  const callout = line.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
  if (callout) {
    const type = callout[1];
    const title = callout[2];
    const titleHtml = title
      ? ` <span class="tok-callout-title">${tokenizeInline(title)}</span>`
      : '';
    return (
      `<span class="tok-quote">></span> ` +
      `<span class="tok-callout-type">[!${escapeHtml(type)}]</span>` +
      titleHtml +
      `\n`
    );
  }

  // 7. Plain blockquote: > text
  const bq = line.match(/^>\s?(.*)$/);
  if (bq) {
    return `<span class="tok-quote">></span> ${tokenizeInline(bq[1])}\n`;
  }

  // 8. Checkbox list item: - [ ] text or - [x] text
  const cb = line.match(/^(\s*[-*+]\s+)\[([ xX])\]\s+(.*)$/);
  if (cb) {
    return (
      `<span class="tok-list-marker">${escapeHtml(cb[1])}</span>` +
      `<span class="tok-checkbox">[${escapeHtml(cb[2])}]</span> ` +
      `${tokenizeInline(cb[3])}\n`
    );
  }

  // 9. Unordered list item: - text, * text, + text
  const ul = line.match(/^(\s*[-*+]\s+)(.*)$/);
  if (ul) {
    return (
      `<span class="tok-list-marker">${escapeHtml(ul[1])}</span>` +
      `${tokenizeInline(ul[2])}\n`
    );
  }

  // 10. Ordered list item: 1. text, 2. text
  const ol = line.match(/^(\s*\d+\.\s+)(.*)$/);
  if (ol) {
    return (
      `<span class="tok-list-marker">${escapeHtml(ol[1])}</span>` +
      `${tokenizeInline(ol[2])}\n`
    );
  }

  // 11. Plain paragraph line — inline tokenization only.
  return `${tokenizeInline(line)}\n`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function highlightMarkdown(text: string): string {
  const state: State = {
    inFencedCode: false,
    inFrontmatter: false,
    frontmatterSeen: false,
    fenceMarker: '',
    lineIndex: 0,
  };

  // Split on \n only; \r is stripped per-line so \r\n input is handled.
  const lines = text.split('\n');
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    state.lineIndex = i;
    parts.push(processLine(lines[i], state, lines));
  }

  let result = parts.join('');
  // Guarantee a trailing newline so the browser doesn't merge the final line
  // into a gutter or lose its line height.
  if (!result.endsWith('\n')) {
    result += '\n';
  }
  return result;
}
