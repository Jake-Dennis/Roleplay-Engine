"use client";

/**
 * ChatWindow Component
 *
 * Displays messages, streaming text, and input area for session chat.
 * Extracted from session/[id]/page.tsx.
 *
 * Usage:
 *   <ChatWindow
 *     messages={messages}
 *     isStreaming={streaming}
 *     streamingContent={streamContent}
 *     input={input}
 *     onInputChange={setInput}
 *     onSend={handleSend}
 *     onMessageAction={...}
 *     scrollRef={messagesEndRef}
 *     inputRef={inputRef}
 *   />
 */

"use client";

import { memo } from "react";
import {
  Send,
  Loader2,
  Sparkles,
  Volume2,
  VolumeX,
  Check,
  Copy,
  Edit3,
  History,
  RotateCcw,
  Trash2,
  GitBranch,
} from "lucide-react";
import { StreamingText } from "@/components/chat/streaming-text";
import { EditHistory } from "@/components/chat/edit-history";
import { classifyIntent, type Intent } from "@/lib/intent-analyzer";

interface Message {
  id: string;
  session_id: string;
  sender_id: string | null;
  content: string;
  timestamp: string;
  sender_name: string | null;
  has_siblings?: number;
}

interface MessageItemProps {
  message: Message;
  isAI: boolean;
  isLastAI: boolean;
  isEditing: boolean;
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
}

const MessageItem = memo(function MessageItem({
  message,
  isAI,
  isLastAI,
  isEditing,
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
}: MessageItemProps) {
  const intent = isAI ? null : classifyIntent(message.content);

  return (
    <div className={`group flex ${isAI ? "" : "flex-row-reverse"}`}>
      <div className={`max-w-[75%] rounded-xl px-4 py-3 ${isAI ? "border border-border-default bg-bg-elevated" : "bg-accent/10"}`}>
        <p className="text-xxs font-medium text-text-muted mb-1 flex items-center gap-1.5">
          <span>{isAI ? "AI Narrator" : message.sender_name || "You"}</span>
          {!isAI && intent && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-bg-raised px-1.5 py-0.5 text-xxs text-text-muted capitalize">
              {intentIcons[intent]}
              {intent}
            </span>
          )}
        </p>

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
              rows={3}
              autoFocus
            />
            <div className="flex gap-1.5">
              <button onClick={() => onSaveEdit(message.id)} className="rounded-md bg-accent px-3 py-1 text-xxs text-white hover:bg-accent-hover">
                Save
              </button>
              <button onClick={onCancelEdit} className="rounded-md bg-bg-raised px-3 py-1 text-xxs text-text-secondary hover:bg-bg-highlight">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
            {message.content}
          </div>
        )}

        {!isEditing && (
          <>
            <p className="mt-1.5 text-xxs text-text-muted flex items-center gap-1">
              <span>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              {message.has_siblings && (
                <span className="inline-flex items-center gap-0.5 text-accent" title="Conversation branch">
                  <GitBranch className="h-2.5 w-2.5" />
                </span>
              )}
            </p>
            <div className="mt-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={() => onTtsPlay(message.id, message.content)} className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary" title={ttsPlayingId === message.id ? "Stop" : "Read Aloud"}>
                {ttsPlayingId === message.id ? <VolumeX className="h-3 w-3 text-accent" /> : <Volume2 className="h-3 w-3" />}
              </button>
              <button onClick={() => onCopy(message.id, message.content)} className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary" title="Copy">
                {copiedId === message.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
              </button>
              {!isAI && (
                <button onClick={() => onStartEdit(message)} className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary" title="Edit">
                  <Edit3 className="h-3 w-3" />
                </button>
              )}
              <button onClick={() => onShowEditHistory(message.id)} className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary" title="Edit history">
                <History className="h-3 w-3" />
              </button>
              {isLastAI && (
                <button onClick={() => onRegenerate(message.id)} className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary" title="Regenerate">
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              <button onClick={() => onDelete(message.id)} className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-error" title="Delete">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

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
}

export function ChatWindow({
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
}: ChatWindowProps) {
  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Sparkles className="mx-auto h-8 w-8 text-text-muted" />
              <p className="mt-2 text-xs text-text-muted">
                Send a message to start the story
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              // Filter out empty AI placeholders (created before streaming starts)
              const visibleMessages = messages.filter((m) => !(m.sender_id === null && !m.content));
              const lastMsgId = visibleMessages[visibleMessages.length - 1]?.id;
              return visibleMessages.map((message) => {
                const isAI = message.sender_id === null;
                const isEditing = editingId === message.id;
                const isLastAI = isAI && message.id === lastMsgId;

              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isAI={isAI}
                  isLastAI={isLastAI}
                  isEditing={isEditing}
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
                />
              );
            });
            })()}

            {/* Streaming message */}
            {isStreaming && (
              <div className="flex">
                <div className="max-w-[75%] rounded-xl border border-border-default bg-bg-elevated px-4 py-3">
                  <p className="text-xxs font-medium text-text-muted mb-1">
                    AI Narrator
                  </p>
                  <StreamingText
                    content={streamingContent}
                    isStreaming={isStreaming}
                  />
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border-default pt-3">
        {disabled ? (
          <div className="flex items-center justify-center rounded-lg border border-border-default bg-bg-raised px-4 py-3">
            <p className="text-xs text-text-muted">
              You are observing this session. Only participants can send messages.
            </p>
          </div>
        ) : (
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
    </>
  );
}
