/**
 * MessageBubble Component
 *
 * Displays a single message with action buttons (TTS, Copy, Edit, Regenerate, Delete).
 * Supports inline editing and streaming text display.
 *
 * Usage:
 *   <MessageBubble
 *     message={msg}
 *     isStreaming={false}
 *     onAction={(action, messageId, content) => handleAction(action, messageId, content)}
 *   />
 */

"use client";

import { useState, useRef, useEffect } from "react";
import {
  Volume2,
  Copy,
  Pencil,
  RefreshCw,
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";

interface Message {
  id: string;
  content: string;
  sender_id: string | null;
  timestamp: string;
  is_deleted?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  canRegenerate?: boolean;
  onAction: (
    action: "tts" | "copy" | "edit" | "regenerate" | "delete",
    messageId: string,
    content?: string
  ) => void;
}

export function MessageBubble({
  message,
  isStreaming = false,
  canRegenerate = false,
  onAction,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const isUser = message.sender_id !== null;
  const isSystem = message.sender_id === "system";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback
    }
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onAction("edit", message.id, editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  if (message.is_deleted) return null;

  return (
    <div
      className={`group relative rounded-xl px-4 py-3 transition-colors ${
        isUser
          ? "bg-accent/5 hover:bg-accent/10"
          : isSystem
          ? "bg-bg-raised/50"
          : "bg-bg-elevated hover:bg-bg-raised/50"
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Sender label */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-xs font-medium ${
            isUser ? "text-accent" : isSystem ? "text-text-muted" : "text-text-primary"
          }`}
        >
          {isUser ? "You" : isSystem ? "System" : "Narrator"}
        </span>
        <span className="text-xxs text-text-muted">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary resize-y min-h-[80px]"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveEdit}
              className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent-hover"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 rounded-lg bg-bg-raised px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <span className="text-xxs text-text-muted">Ctrl+Enter to save</span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-text-secondary whitespace-pre-wrap">
          {isStreaming ? (
            <span className="inline-flex items-center gap-1">
              {message.content}
              <span className="inline-block h-4 w-0.5 bg-accent animate-pulse" />
            </span>
          ) : (
            message.content
          )}
        </div>
      )}

      {/* Action buttons */}
      {!isEditing && showActions && !isSystem && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-bg-raised/90 p-1 shadow-sm backdrop-blur-sm">
          <button
            onClick={() => onAction("tts", message.id)}
            className="rounded p-1.5 text-text-muted hover:bg-bg-overlay hover:text-text-primary"
            title="Text to Speech"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="rounded p-1.5 text-text-muted hover:bg-bg-overlay hover:text-text-primary"
            title={copied ? "Copied!" : "Copy"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => {
              setEditContent(message.content);
              setIsEditing(true);
            }}
            className="rounded p-1.5 text-text-muted hover:bg-bg-overlay hover:text-text-primary"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {canRegenerate && (
            <button
              onClick={() => onAction("regenerate", message.id)}
              className="rounded p-1.5 text-text-muted hover:bg-bg-overlay hover:text-text-primary"
              title="Regenerate"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onAction("delete", message.id)}
            className="rounded p-1.5 text-text-muted hover:bg-bg-overlay hover:text-error"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
