'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Move, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface MovePageDialogProps {
  open: boolean;
  onClose: () => void;
  pagePath: string; // relative path like "concepts/events/foo.md"
  folders: string[]; // available folder names
  universeId?: string;
}

export function MovePageDialog({ open, onClose, pagePath, folders, universeId }: MovePageDialogProps) {
  const router = useRouter();
  const currentFolder = pagePath.split('/')[0];
  const filename = pagePath.split('/').pop() || '';
  const [targetFolder, setTargetFolder] = useState(currentFolder);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMove = useCallback(async () => {
    if (targetFolder === currentFolder) return;
    setMoving(true);
    setError(null);

    try {
      const newPath = `${targetFolder}/${filename}`;
      const res = await fetch('/api/wiki/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moves: [{ oldPath: pagePath, newPath }],
          universeId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Move failed' }));
        throw new Error(err.error || 'Move failed');
      }

      onClose();
      router.push(`/wiki/${newPath.replace(/\.md$/, '')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setMoving(false);
    }
  }, [targetFolder, currentFolder, filename, pagePath, universeId, onClose, router]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Move Page</h2>
        <p className="text-xs text-text-muted mb-4">
          Move <span className="text-text-secondary font-mono">{filename}</span> to a different folder
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">From</label>
            <div className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-muted">
              {currentFolder}/
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary block mb-1">To</label>
            <select
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
            >
              {folders.map((f) => (
                <option key={f} value={f} disabled={f === currentFolder}>
                  {f}/{f === currentFolder ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-lg bg-error/10 border border-error/20 px-3 py-2 text-xs text-error">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleMove}
              disabled={moving || targetFolder === currentFolder}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {moving ? <Loader2 size={12} className="animate-spin" /> : <Move size={12} />}
              {moving ? 'Moving...' : 'Move'}
            </button>
            <button
              onClick={onClose}
              disabled={moving}
              className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
