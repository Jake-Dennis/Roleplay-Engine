"use client";

import { useEffect, useState } from "react";
import { History, X, ChevronDown } from "lucide-react";

interface EditRecord {
  id: string;
  userId: string;
  username: string;
  oldContent: string;
  newContent: string;
  editedAt: string;
}

interface EditHistoryProps {
  messageId: string;
  sessionId: string;
  onClose: () => void;
}

export function EditHistory({ messageId, sessionId, onClose }: EditHistoryProps) {
  const [edits, setEdits] = useState<EditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEdit, setExpandedEdit] = useState<string | null>(null);

  // M3: Re-fetch every time the modal opens (not just on first open)
  useEffect(() => {
    setLoading(true);
    setEdits([]);
    setExpandedEdit(null);
    fetch(`/api/sessions/${sessionId}/messages/${messageId}/edits`)
      .then((res) => res.json())
      .then((data) => {
        setEdits(data.edits || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [messageId, sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="mx-4 max-h-[80vh] w-full max-w-lg rounded-xl border border-border-default bg-bg-elevated shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-text-accent" />
            <h3 className="text-sm font-medium text-text-primary">Edit History</h3>
            <span className="text-xxs text-text-muted">({edits.length})</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-text-muted">
              Loading edit history...
            </div>
          ) : edits.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              No edit history for this message
            </div>
          ) : (
            <div className="space-y-3">
              {edits.map((edit) => (
                <div
                  key={edit.id}
                  className="rounded-lg border border-border-default bg-bg-raised"
                >
                  <button
                    onClick={() => setExpandedEdit(expandedEdit === edit.id ? null : edit.id)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary">{edit.username}</span>
                      <span className="text-xxs text-text-muted">
                        {new Date(edit.editedAt).toLocaleString()}
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-text-muted transition-transform ${
                        expandedEdit === edit.id ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {expandedEdit === edit.id && (
                    <div className="border-t border-border-default px-3 py-3">
                      <div className="mb-2">
                        <span className="text-xxs font-medium text-error">Before:</span>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-bg-elevated p-2 text-xxs text-text-secondary overflow-x-auto">
                          {edit.oldContent}
                        </pre>
                      </div>
                      <div>
                        <span className="text-xxs font-medium text-success">After:</span>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-bg-elevated p-2 text-xxs text-text-secondary overflow-x-auto">
                          {edit.newContent}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
