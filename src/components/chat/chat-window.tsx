"use client";

/**
 * ChatWindow Component
 *
 * Displays messages, streaming text, and input area for session chat.
 * Orchestrates MessageList and StreamingArea sub-components.
 *
 * Usage:
 *   <ChatWindow
 *     messages={messages}
 *     isStreaming={streaming}
 *     streamingContent={streamContent}
 *     ...
 *   />
 */

import { memo } from "react";
import {
  Send,
  Loader2,
  Sparkles,
} from "lucide-react";
import { MessageList, type Message } from "@/components/session/message-list";
import { StreamingArea } from "@/components/session/streaming-area";
import { EditHistory } from "@/components/chat/edit-history";
import type { Intent } from "@/lib/intent-analyzer";

interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  input: string;
  editingId: string | null;
  editContent: string;
  copiedId: string | null;
  ttsPlayingId: string | null;
  intentIcons: Record<Intent, React.ReactNode>;
  onCopy: (id: string, content: string) => void;
  onStartEdit: (message: Message) => void;
  onSaveEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onDelete: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onTtsPlay: (messageId: string, content: string) => void;
  onEditContentChange: (content: string) => void;
  onShowEditHistory: (messageId: string) => void;
  onSend: () => void;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  sessionId: string;
  editHistoryMessageId: string | null;
  onEditHistoryClose: () => void;
  disabled?: boolean;
  choices?: string[] | null;
  onChoiceSelect?: (option: string) => void;
  onRegenerateChoices?: () => void;
  isRegeneratingChoices?: boolean;
}

export const ChatWindow = memo(function ChatWindow({
  messages,
  isStreaming,
  streamingContent,
  input,
  editingId,
  editContent,
  copiedId,
  ttsPlayingId,
  intentIcons,
  onCopy,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRegenerate,
  onTtsPlay,
  onEditContentChange,
  onShowEditHistory,
  onSend,
  onInputChange,
  onKeyDown,
  scrollRef,
  inputRef,
  sessionId,
  editHistoryMessageId,
  onEditHistoryClose,
  disabled = false,
  choices,
  onChoiceSelect,
  onRegenerateChoices,
  isRegeneratingChoices = false,
}: ChatWindowProps) {
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto py-4 flex flex-col">
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Sparkles className="mx-auto h-8 w-8 text-text-muted" />
              <p className="mt-2 text-xs text-text-muted">
                Send a message to start the story
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            {/* Spacer pushes messages toward bottom; shrinks to 0 when content fills container */}
            <div className="flex-1" />
            <div className="space-y-3">
              <MessageList
              messages={messages}
              editingId={editingId}
              editContent={editContent}
              copiedId={copiedId}
              ttsPlayingId={ttsPlayingId}
              intentIcons={intentIcons}
              onCopy={onCopy}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              onRegenerate={onRegenerate}
              onTtsPlay={onTtsPlay}
              onEditContentChange={onEditContentChange}
              onShowEditHistory={onShowEditHistory}
              onRegenerateChoices={onRegenerateChoices}
              isRegeneratingChoices={isRegeneratingChoices}
            />
            <StreamingArea
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              choices={choices}
              onChoiceSelect={onChoiceSelect}
            />
            <div ref={scrollRef} />
          </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border-default pt-3">
        {disabled ? (
          <div className="flex items-center justify-center rounded-lg border border-border-default bg-bg-raised px-4 py-3">
            <p className="text-xs text-text-muted">
              You are observing this session. Only participants can send messages.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  isStreaming ? "AI is responding..." : "Type your message..."
                }
                className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent resize-none"
                rows={2}
                disabled={isStreaming}
              />
              <button
                onClick={onSend}
                disabled={!input.trim() || isStreaming}
                className="flex h-[44px] w-[44px] items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 flex-shrink-0 self-end"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit History Modal */}
      {editHistoryMessageId && (
        <EditHistory
          messageId={editHistoryMessageId}
          sessionId={sessionId}
          onClose={onEditHistoryClose}
        />
      )}
    </div>
  );
});
