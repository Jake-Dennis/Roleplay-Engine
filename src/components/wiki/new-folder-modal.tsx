'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { FolderPlus } from 'lucide-react';

interface NewFolderModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (folderName: string) => Promise<void> | void;
}

/**
 * Modal that prompts the user for a new wiki folder name and creates it.
 *
 * The folder name is sanitized server-side (lowercase, alphanumeric + hyphens,
 * no leading dots, no path separators). The user sees a live preview of the
 * resulting folder name as they type.
 */
export default function NewFolderModal({ open, onClose, onCreate }: NewFolderModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="New folder" size="sm">
      {open && <NewFolderForm onClose={onClose} onCreate={onCreate} />}
    </Modal>
  );
}

/**
 * Inner form. Mounted fresh on every modal open so input state resets
 * automatically without needing effects to clear it.
 */
function NewFolderForm({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (folderName: string) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  const canSubmit = sanitized.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(sanitized);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-folder-name" className="block text-xs font-medium text-text-secondary mb-1">
          Folder name
        </label>
        <input
          id="new-folder-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. locations, factions, items"
          autoFocus
          disabled={submitting}
          className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border-default text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <p className="mt-1.5 text-xxs text-text-muted">
          Lowercase letters, numbers, hyphens, and underscores only. New pages
          in this folder will be tagged with type <code className="px-1 py-0.5 rounded bg-bg-raised text-text-secondary">{sanitized || 'folder'}</code>.
        </p>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-error/10 border border-error/20">
          <p className="text-error text-xs">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-raised transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-text-primary text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          <FolderPlus size={12} />
          {submitting ? 'Creating…' : 'Create folder'}
        </button>
      </div>
    </form>
  );
}
