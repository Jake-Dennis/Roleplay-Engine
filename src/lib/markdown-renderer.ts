/**
 * Markdown Renderer
 *
 * Converts markdown to HTML for preview rendering.
 * Supports: headers, bold, italic, code blocks, inline code,
 * wikilinks, links, unordered lists, paragraphs.
 */

export function renderMarkdownPreview(md: string): string {
  if (!md) return "";
  let html = md;

  // Escape HTML
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-bg-raised rounded-lg p-3 my-2 text-xs overflow-x-auto"><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-bg-raised px-1.5 py-0.5 rounded text-xs text-accent">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-text-primary mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-text-primary mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-text-primary mt-4 mb-2">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="font-bold text-text-primary"><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="text-text-secondary">$1</em>');

  // Wikilinks
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="text-accent underline cursor-pointer">[[$1]]</span>');

  // Links — validate URL scheme to prevent XSS (javascript:, data:, etc.)
  const SAFE_SCHEMES = /^(https?:|mailto:|tel:|\/|#)/i;
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
    const safeHref = SAFE_SCHEMES.test(href) ? href : "#";
    return `<a href="${safeHref}" class="text-accent underline">${text}</a>`;
  });

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-text-secondary">$1</li>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n/g, '</p><p class="text-sm text-text-secondary my-1">');
  html = html.replace(/\n/g, '<br/>');

  return `<p class="text-sm text-text-secondary my-1">${html}</p>`;
}
