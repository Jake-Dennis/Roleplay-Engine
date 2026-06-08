"use client";

import { useState } from "react";
import { clsx } from "clsx";

interface MessageBubbleProps {
  id: string;
  content: string;
  sender_name: string | null;
  sender_id: string | null;
  timestamp: string;
  isStreaming?: boolean;
  onAction: (action: string, messageId: string, data?: string) => void;
}

export function MessageBubble({
  id,
  content,
  sender_name,
  sender_id,
  timestamp,
  isStreaming = false,
  onAction,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = sender_id !== null;
  const isSystem = !sender_name && !sender_id;

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleEditSave() {
    if (editContent.trim() && editContent !== content) {
      onAction("edit", id, editContent);
    }
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.ctrlKey) {
      handleEditSave();
    }
    if (e.key === "Escape") {
      setEditContent(content);
      setIsEditing(false);
    }
  }

  return (
    <div
      className={clsx(
        "group relative px-4 py-3 transition-colors",
        isUser ? "bg-surface-raised/50" : "bg-surface-elevated/50",
        isSystem && "opacity-60"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Sender and timestamp */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className={clsx(
            "text-xs font-semibold",
            isUser ? "text-accent" : "text-text-secondary"
          )}
        >
          {sender_name || (isUser ? "You" : "AI")}
        </span>
        <span className="text-xs text-text-muted">
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {isStreaming && (
          <span className="text-xs text-status-info animate-pulse">
            generating...
          </span>
        )}
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full p-2 bg-surface-raised border border-border rounded text-text-primary text-sm resize-y min-h-[80px] focus:outline-none focus:border-accent"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleEditSave}
              className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditContent(content);
                setIsEditing(false);
              }}
              className="px-2 py-1 text-xs bg-surface-raised border border-border text-text-secondary rounded hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
          {content || (isStreaming ? "..." : "")}
        </div>
      )}

      {/* Action buttons */}
      {showActions && !isStreaming && !isSystem && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-surface-raised border border-border rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAction("tts", id)}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Read aloud"
          >
            🔊
          </button>
          <button
            onClick={handleCopy}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Copy"
          >
            {copied ? "✓" : "📋"}
          </button>
          <button
            onClick={() => {
              setEditContent(content);
              setIsEditing(true);
            }}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Edit"
          >
            ✏️
          </button>
          {!isUser && (
            <button
              onClick={() => onAction("regenerate", id)}
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
              title="Regenerate"
            >
              🔄
            </button>
          )}
          <button
            onClick={() => onAction("delete", id)}
            className="p-1 text-text-muted hover:text-status-error transition-colors"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}
