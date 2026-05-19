import type { Plugin } from 'unified';
import type { Node, Parent, Data } from 'unist';
import type { Text as MdastText } from 'mdast';
import { visit } from 'unist-util-visit';

// Embed node type definition
export interface EmbedNode extends Node {
  type: 'embed';
  data: Data & {
    hName: 'div';
    hProperties: {
      className: string[];
      'data-embed-target': string;
      'data-embed-section'?: string;
      'data-embed-block'?: string;
      'data-embed-dimensions'?: string;
      'data-embed-type': 'note' | 'image';
    };
  };
}

// Parsed embed metadata
export interface EmbedMeta {
  target: string;
  section?: string;
  blockId?: string;
  dimensions?: string;
  type: 'note' | 'image';
}

// Image extensions that trigger image embed rendering
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;

/**
 * Parse embed syntax from a matched string.
 *
 * Supported formats:
 * - ![[Page]] — full page embed
 * - ![[Page#Heading]] — heading section embed
 * - ![[Page#^block-id]] — specific block embed
 * - ![[Image.png]] — image embed
 * - ![[Image.png|100x200]] — image with dimensions
 */
function parseEmbedSyntax(raw: string): EmbedMeta | null {
  // Strip the ![[ and ]]
  const inner = raw.slice(3, -2).trim();
  if (!inner) return null;

  // Check for dimensions: Page|100x200
  let dimensions: string | undefined;
  let targetPart = inner;
  const pipeIndex = inner.lastIndexOf('|');
  if (pipeIndex !== -1) {
    const afterPipe = inner.slice(pipeIndex + 1).trim();
    // Dimensions pattern: 100x200 or 100 or 100x
    if (/^\d+x?\d*$/.test(afterPipe)) {
      dimensions = afterPipe;
      targetPart = inner.slice(0, pipeIndex).trim();
    }
  }

  // Check for section/block: Page#Heading or Page#^block-id
  let section: string | undefined;
  let blockId: string | undefined;
  let target = targetPart;

  const hashIndex = targetPart.indexOf('#');
  if (hashIndex !== -1) {
    target = targetPart.slice(0, hashIndex).trim();
    const afterHash = targetPart.slice(hashIndex + 1).trim();

    if (afterHash.startsWith('^')) {
      blockId = afterHash.slice(1).trim();
    } else {
      section = afterHash;
    }
  }

  if (!target) return null;

  const type = IMAGE_EXTENSIONS.test(target) ? 'image' : 'note';

  return { target, section, blockId, dimensions, type };
}

/**
 * Regex to find ![[...]] patterns in text.
 * Matches ![[ followed by any characters except ]] then ]]
 */
const EMBED_REGEX = /!\[\[([^\]]*(?:\](?!\]))?[^\]]*)\]\]/g;

/**
 * Process a text node, splitting it around embed matches.
 * Returns an array of nodes (text and embed nodes).
 */
function processTextNode(node: Node): Node[] {
  const text = (node as MdastText).value;
  if (!text) return [node];

  const results: Node[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex state
  EMBED_REGEX.lastIndex = 0;

  while ((match = EMBED_REGEX.exec(text)) !== null) {
    // Add text before the embed
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText) {
        const textNode: MdastText = {
          type: 'text',
          value: beforeText,
        };
        results.push(textNode);
      }
    }

    // Parse the embed
    const fullMatch = match[0]; // e.g., ![[Page#Heading]]
    const meta = parseEmbedSyntax(fullMatch);

    if (meta) {
      const embedNode: EmbedNode = {
        type: 'embed',
        data: {
          hName: 'div',
          hProperties: {
            className: ['wiki-embed', `wiki-embed-${meta.type}`],
            'data-embed-target': meta.target,
            ...(meta.section ? { 'data-embed-section': meta.section } : {}),
            ...(meta.blockId ? { 'data-embed-block': meta.blockId } : {}),
            ...(meta.dimensions ? { 'data-embed-dimensions': meta.dimensions } : {}),
            'data-embed-type': meta.type,
          },
        },
      };
      results.push(embedNode);
    } else {
      // Failed to parse — keep as text
      const textNode: MdastText = {
        type: 'text',
        value: fullMatch,
      };
      results.push(textNode);
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text after last embed
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      const textNode: MdastText = {
        type: 'text',
        value: remainingText,
      };
      results.push(textNode);
    }
  }

  // If no embeds found, return original node
  if (results.length === 0) {
    return [node];
  }

  return results;
}

/**
 * Remark plugin that transforms Obsidian-style embed syntax ![[...]].
 *
 * Transforms:
 *   ![[Page]] → embed node with target="Page"
 *   ![[Page#Heading]] → embed node with target="Page", section="Heading"
 *   ![[Page#^block-id]] → embed node with target="Page", blockId="block-id"
 *   ![[Image.png]] → embed node with type="image"
 *   ![[Image.png|100x200]] → embed node with type="image", dimensions="100x200"
 *
 * Must run BEFORE wikiLinkPlugin so that ![[...]] is consumed before
 * the wiki link plugin sees [[...]].
 */
export const remarkEmbed: Plugin<[]> = function () {
  return (tree) => {
    visit(tree, 'text', (node: Node, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || typeof index !== 'number') return;

      const text = (node as MdastText).value;
      if (!text || !text.includes('![[')) return;

      const results = processTextNode(node);

      // Only replace if we actually found embeds
      if (results.length === 1 && results[0] === node) return;

      parent.children.splice(index, 1, ...results);
    });
  };
};

export default remarkEmbed;
