import type { Plugin } from 'unified';
import type { Node, Parent } from 'unist';
import { visit } from 'unist-util-visit';

// Callout type definitions
export interface CalloutData {
  calloutType: string;
  fold?: '+' | '-';
  title?: string;
}

export interface CalloutNode extends Parent {
  type: 'callout';
  data: {
    hName: 'div';
    hProperties: {
      className: string[];
      'data-callout': string;
      'data-callout-fold'?: string;
    };
  };
  children: Node[];
}

// 12 Obsidian callout types with their default icons
export const CALLOUT_TYPES: Record<string, string> = {
  note: 'lucide-pencil',
  abstract: 'lucide-clipboard-list',
  info: 'lucide-info',
  todo: 'lucide-check-circle-2',
  tip: 'lucide-flame',
  success: 'lucide-check',
  question: 'lucide-help-circle',
  warning: 'lucide-alert-triangle',
  failure: 'lucide-x',
  danger: 'lucide-zap',
  bug: 'lucide-bug',
  example: 'lucide-list',
  quote: 'lucide-quote',
};

// Aliases mapping to canonical types
const CALLOUT_ALIASES: Record<string, string> = {
  // note aliases
  note: 'note',
  default: 'note',
  // abstract aliases
  abstract: 'abstract',
  summary: 'abstract',
  tldr: 'abstract',
  // info aliases
  info: 'info',
  // todo aliases
  todo: 'todo',
  // tip aliases
  tip: 'tip',
  hint: 'tip',
  // success aliases
  success: 'success',
  check: 'success',
  done: 'success',
  // question aliases
  question: 'question',
  help: 'question',
  faq: 'question',
  // warning aliases
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  // failure aliases
  failure: 'failure',
  fail: 'failure',
  missing: 'failure',
  // danger aliases
  danger: 'danger',
  error: 'danger',
  // bug aliases
  bug: 'bug',
  // example aliases
  example: 'example',
  // quote aliases
  quote: 'quote',
  cite: 'quote',
};

// Regex to match callout header: [!type] or [!type+] or [!type-] followed by optional title
const CALLOUT_REGEX = /^\[!([a-z]+)([+-])?\]\s*(.*)/i;

/**
 * Recursively process blockquote children to find and transform nested callouts.
 */
function processChildren(node: Parent): Node[] {
  if (!node.children || node.children.length === 0) {
    return node.children || [];
  }

  // First, check if this blockquote itself is a callout
  const firstChild = node.children[0];
  if (
    firstChild &&
    firstChild.type === 'paragraph' &&
    'children' in firstChild
  ) {
    const paragraph = firstChild as Parent;
    const textNode = paragraph.children[0];
    if (textNode && textNode.type === 'text' && 'value' in textNode) {
      const match = CALLOUT_REGEX.exec(textNode.value as string);
      if (match) {
        const [, rawType, fold, titleText] = match;
        const canonicalType = CALLOUT_ALIASES[rawType.toLowerCase()] || rawType.toLowerCase();

        // Build remaining children (skip the callout header paragraph, or keep rest of it)
        const remainingChildren = node.children.slice(1);

        // If the paragraph has more text after the callout header, keep it
        if (paragraph.children.length > 1) {
          const remainingParagraphChildren = paragraph.children.slice(1);
          // Check if there's remaining text that should be part of content
          const remainingText = remainingParagraphChildren
            .filter((n) => n.type === 'text')
            .map((n) => (n as any).value)
            .join('')
            .trim();

          if (remainingText || remainingParagraphChildren.length > 0) {
            // Create a new paragraph with remaining content
            const newParagraph: Parent = {
              type: 'paragraph',
              children: remainingParagraphChildren,
            };
            remainingChildren.unshift(newParagraph);
          }
        }

        // Recursively process remaining children for nested callouts
        const processedChildren: Node[] = [];
        for (const child of remainingChildren) {
          if ('children' in child && child.type === 'blockquote') {
            // Check if nested blockquote is also a callout
            processedChildren.push(...processCallout(child as Parent));
          } else {
            processedChildren.push(child);
          }
        }

        // Create callout node with HTML-compatible structure
        const calloutNode: CalloutNode = {
          type: 'callout',
          data: {
            hName: 'div',
            hProperties: {
              className: ['callout', `callout-${canonicalType}`],
              'data-callout': canonicalType,
              ...(fold ? { 'data-callout-fold': fold } : {}),
            },
          },
          children: processedChildren,
        };

        // Store metadata for React component
        (calloutNode.data as any).calloutType = canonicalType;
        (calloutNode.data as any).fold = fold as '+' | '-' | undefined;
        (calloutNode.data as any).title = titleText.trim() || undefined;

        return [calloutNode];
      }
    }
  }

  // Not a callout blockquote — recursively process children
  return node.children.map((child) => {
    if ('children' in child && child.type === 'blockquote') {
      const results = processCallout(child as Parent);
      return results.length === 1 ? results[0] : child;
    }
    return child;
  });
}

/**
 * Process a blockquote node — returns array of nodes (callout or original).
 */
function processCallout(node: Parent): Node[] {
  const firstChild = node.children?.[0];
  if (
    firstChild &&
    firstChild.type === 'paragraph' &&
    'children' in firstChild
  ) {
    const paragraph = firstChild as Parent;
    const textNode = paragraph.children[0];
    if (textNode && textNode.type === 'text' && 'value' in textNode) {
      const match = CALLOUT_REGEX.exec(textNode.value as string);
      if (match) {
        const [, rawType, fold, titleText] = match;
        const canonicalType = CALLOUT_ALIASES[rawType.toLowerCase()] || rawType.toLowerCase();

        // Build remaining children
        const remainingChildren = node.children!.slice(1);

        // Handle remaining paragraph content
        if (paragraph.children.length > 1) {
          const remainingParagraphChildren = paragraph.children.slice(1);
          const newParagraph: Parent = {
            type: 'paragraph',
            children: remainingParagraphChildren,
          };
          remainingChildren.unshift(newParagraph);
        }

        // Recursively process for nested callouts
        const processedChildren: Node[] = [];
        for (const child of remainingChildren) {
          if ('children' in child && child.type === 'blockquote') {
            processedChildren.push(...processCallout(child as Parent));
          } else {
            processedChildren.push(child);
          }
        }

        const calloutNode: CalloutNode = {
          type: 'callout',
          data: {
            hName: 'div',
            hProperties: {
              className: ['callout', `callout-${canonicalType}`],
              'data-callout': canonicalType,
              ...(fold ? { 'data-callout-fold': fold } : {}),
            },
          },
          children: processedChildren,
        };

        (calloutNode.data as any).calloutType = canonicalType;
        (calloutNode.data as any).fold = fold as '+' | '-' | undefined;
        (calloutNode.data as any).title = titleText.trim() || undefined;

        return [calloutNode];
      }
    }
  }

  // Not a callout — return original with processed children
  return [node];
}

/**
 * Remark plugin that transforms Obsidian-style callout blockquotes.
 *
 * Transforms:
 *   > [!info] Title
 *   > Content here
 *
 * Into custom callout nodes that render as styled divs.
 */
export const remarkCallout: Plugin<[]> = function () {
  return (tree) => {
    visit(tree, 'blockquote', (node: Node, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || typeof index !== 'number') return;

      const blockquoteNode = node as Parent;
      const results = processCallout(blockquoteNode);

      if (results.length === 1 && results[0] === blockquoteNode) {
        // No transformation — but still process nested blockquotes
        blockquoteNode.children = processChildren(blockquoteNode);
        return;
      }

      // Replace blockquote with transformed nodes
      parent.children.splice(index, 1, ...results);
    });
  };
};

export default remarkCallout;
