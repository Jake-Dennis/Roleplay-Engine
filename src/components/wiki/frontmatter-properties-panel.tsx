'use client';

import React, { useState } from 'react';
import { Tag, X, Plus } from 'lucide-react';
import { EMPTY_FRONTMATTER } from '@/lib/wiki/frontmatter';
import type { WikiFrontmatter } from '@/lib/wiki/types';

interface FrontmatterPropertiesPanelProps {
  frontmatter: WikiFrontmatter;
  onChange: (next: WikiFrontmatter) => void;
  readOnlyFields?: Array<keyof WikiFrontmatter>;
}

const TYPE_OPTIONS: ReadonlyArray<WikiFrontmatter['type']> = [
  'entity',
  'concept',
  'source',
  'synthesis',
];

const STATUS_OPTIONS: ReadonlyArray<WikiFrontmatter['status']> = [
  'draft',
  'reviewed',
  'locked',
  'rejected',
];

const LABEL_CLASS =
  'text-xs font-medium text-text-secondary uppercase tracking-wider mb-1';
const INPUT_CLASS =
  'w-full px-3 py-2 rounded border border-border-default bg-bg-base text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors';
const EXPLAINER_CLASS = 'mt-1 text-xxs text-text-muted';
const WARNING_CLASS = 'mt-1 text-xxs text-error';

function isReadOnlyField(
  field: keyof WikiFrontmatter,
  readOnlyFields?: ReadonlyArray<keyof WikiFrontmatter>
): boolean {
  return readOnlyFields?.includes(field) ?? false;
}

function formatTimestamp(iso: string | Date): string {
  return new Date(iso).toLocaleString();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function FrontmatterPropertiesPanel({
  frontmatter,
  onChange,
  readOnlyFields,
}: FrontmatterPropertiesPanelProps) {
  const [tagDraft, setTagDraft] = useState('');
  const [titleWarning, setTitleWarning] = useState(false);

  const tags = frontmatter.tags ?? [];
  const isNewPage = frontmatter === EMPTY_FRONTMATTER;
  const titleRO = isReadOnlyField('title', readOnlyFields);
  const typeRO = isReadOnlyField('type', readOnlyFields);
  const statusRO = isReadOnlyField('status', readOnlyFields);
  const tagsRO = isReadOnlyField('tags', readOnlyFields);
  const universeRO = isReadOnlyField('universe', readOnlyFields);

  function update<K extends keyof WikiFrontmatter>(
    field: K,
    value: WikiFrontmatter[K]
  ): void {
    onChange({ ...frontmatter, [field]: value });
  }

  function addTag(): void {
    const trimmed = tagDraft.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setTagDraft('');
      return;
    }
    onChange({ ...frontmatter, tags: [...tags, trimmed] });
    setTagDraft('');
  }

  function removeTag(tag: string): void {
    onChange({
      ...frontmatter,
      tags: tags.filter((t) => t !== tag),
    });
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }

  function handleTitleBlur(): void {
    setTitleWarning(frontmatter.title === 'Untitled');
  }

  return (
    <div className="p-4 border-b border-border-default bg-bg-elevated">
      <div className="grid grid-cols-[100px_1fr] gap-3 items-start">
        {/* Title */}
        <label htmlFor="fm-title" className={LABEL_CLASS}>
          Title
        </label>
        <div className="flex flex-col">
          <input
            id="fm-title"
            type="text"
            autoFocus={isNewPage}
            disabled={titleRO}
            value={frontmatter.title}
            onChange={(e) => update('title', e.target.value)}
            onBlur={handleTitleBlur}
            className={INPUT_CLASS}
          />
          {titleWarning && (
            <span className={WARNING_CLASS}>
              Title is still &quot;Untitled&quot; — please give this page a real name.
            </span>
          )}
        </div>

        {/* Type */}
        <label htmlFor="fm-type" className={LABEL_CLASS}>
          Type
        </label>
        <div className="flex flex-col">
          <select
            id="fm-type"
            disabled={typeRO}
            value={frontmatter.type}
            onChange={(e) =>
              update('type', e.target.value as WikiFrontmatter['type'])
            }
            className={INPUT_CLASS}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {capitalize(opt)}
              </option>
            ))}
          </select>
          <span className={EXPLAINER_CLASS}>
            Determines folder placement and category
          </span>
        </div>

        {/* Status */}
        <label htmlFor="fm-status" className={LABEL_CLASS}>
          Status
        </label>
        <div className="flex flex-col">
          <select
            id="fm-status"
            disabled={statusRO}
            value={frontmatter.status}
            onChange={(e) =>
              update('status', e.target.value as WikiFrontmatter['status'])
            }
            className={INPUT_CLASS}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {capitalize(opt)}
              </option>
            ))}
          </select>
          <span className={EXPLAINER_CLASS}>
            draft → reviewed → locked. Locked pages are immutable.
          </span>
        </div>

        {/* Tags */}
        <label htmlFor="fm-tag-input" className={LABEL_CLASS}>
          Tags
        </label>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <input
              id="fm-tag-input"
              type="text"
              placeholder="add tag…"
              disabled={tagsRO}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className={INPUT_CLASS}
            />
            <button
              type="button"
              onClick={addTag}
              disabled={tagsRO}
              aria-label="Add tag"
              className="p-2 rounded bg-bg-highlight text-text-secondary hover:text-accent hover:bg-accent-muted transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent-muted text-accent border border-accent/20"
                >
                  <Tag size={10} />
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    disabled={tagsRO}
                    aria-label={`Remove tag ${tag}`}
                    className="hover:text-error transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Universe */}
        <label htmlFor="fm-universe" className={LABEL_CLASS}>
          Universe
        </label>
        <div className="flex flex-col">
          <input
            id="fm-universe"
            type="text"
            placeholder="(default universe)"
            disabled={universeRO}
            value={frontmatter.universe ?? ''}
            onChange={(e) =>
              update('universe', e.target.value || undefined)
            }
            className={INPUT_CLASS}
          />
        </div>

        {/* Created (read-only timestamp) */}
        {frontmatter.created && (
          <>
            <span className={LABEL_CLASS}>Created</span>
            <span className="text-sm text-text-secondary py-2">
              {formatTimestamp(frontmatter.created)}
            </span>
          </>
        )}

        {/* Updated (read-only timestamp) */}
        {frontmatter.updated && (
          <>
            <span className={LABEL_CLASS}>Updated</span>
            <span className="text-sm text-text-secondary py-2">
              {formatTimestamp(frontmatter.updated)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
