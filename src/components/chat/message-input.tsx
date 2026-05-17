/**
 * MessageInput Component
 *
 * Textarea + send button for chat input.
 * Supports Ctrl+Enter to send, auto-resize, and disabled state.
 *
 * Usage:
 *   <MessageInput onSend={(text) => sendMessage(text)} disabled={isGenerating} />
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = "Type your action or dialogue...",
  isStreaming = false,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  return (
    <div className="flex items-end gap-2 rounded-xl border border-border-default bg-bg-elevated p-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isStreaming}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50"
        style={{ maxHeight: "200px" }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || isStreaming || !text.trim()}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent"
      >
        {isStreaming ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
