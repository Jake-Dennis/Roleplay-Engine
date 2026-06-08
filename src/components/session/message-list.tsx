"use client";

/**
 * MessageList Component
 *
 * Renders session messages with entrance animations, editing, TTS, copy,
 * regenerate, and delete controls. Memoized for performance.
 *
 * Usage:
 *   <MessageList
 *     messages={messages}
 *     editingId={editingId}
 *     editContent={editContent}
 *     copiedId={copiedId}
 *     ttsPlayingId={ttsPlayingId}
 *     intentIcons={intentIcons}
 *     scrollRef={scrollRef}
 *     onCopy={handleCopy}
 *     onStartEdit={handleStartEdit}
 *     onSaveEdit={handleSaveEdit}
 *     onCancelEdit={() => setEditingId(null)}
 *     onDelete={handleDelete}
 *     onRegenerate={handleRegenerate}
 *     onTtsPlay={handleTtsPlay}
 *     onEditContentChange={setEditContent}
 *     onShowEditHistory={setEditHistoryMessageId}
 *   />
 */

import { memo, useState } from "react";
import {
  Volume2,
  VolumeX,
  Check,
  Copy,
  Edit3,
  History,
  RotateCcw,
  Lightbulb,
  Trash2,
  GitBranch,
  User,
  Loader2,
  Sparkles,
} from "lucide-react";
import { classifyIntent, type Intent } from "@/lib/intent-analyzer";

/**
 * Parse [[wikilinks]] in message content and render as blue highlighted spans.
 * Supports: [[Page]], [[Page|Display Text]], [[Universe::Page]]
 */
function renderContentWithWikilinks(content: string): React.ReactNode[] {
  const regex = /\[\[([^\[\]]+?)(?:\|([^\[\]]+))?\]\]/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      nodes.push(
        <span key={key++}>{content.slice(lastIndex, match.index)}</span>
      );
    }

    const target = match[1].trim();
    const alias = match[2]?.trim();
    const displayText = alias || (target.includes("::") ? target.split("::")[1].trim() : target);

    nodes.push(
      <span
        key={key++}
        className="text-accent font-medium cursor-pointer hover:underline"
        title={target}
      >
        {displayText}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < content.length) {
    nodes.push(
      <span key={key++}>{content.slice(lastIndex)}</span>
    );
  }

  return nodes.length > 0 ? nodes : [content];
}

export interface Message {
  id: string;
  sessionId: string;
  senderId: string | null;
  content: string;
  timestamp: string;
  senderName: string | null;
  personaName: string | null;
  personaAvatar: string | null;
  hasSiblings?: number;
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
  onRegenerateChoices?: () => void;
  isRegeneratingChoices?: boolean;
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
  onRegenerateChoices,
  isRegeneratingChoices = false,
}: MessageItemProps) {
  const intent = isAI ? null : classifyIntent(message.content);

  return (
    <div id={`msg-${message.id}`} className={`group flex ${isAI ? "" : "flex-row-reverse"}`}>
      <div
        className={`max-w-[75%] rounded-xl px-4 py-3 ${isAI ? "border border-border-default bg-bg-elevated" : "bg-accent/10"}`}
      >
        <p className="text-xxs font-medium text-text-muted mb-1 flex items-center gap-1.5">
          <span>{isAI ? "AI Narrator" : (message.personaName || message.senderName || "You")}</span>
          {!isAI && message.personaName && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-bg-raised px-1.5 py-0.5 text-xxs text-text-muted">
              <User className="h-2.5 w-2.5" />
              {message.personaName}
            </span>
          )}
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
              <button
                onClick={() => onSaveEdit(message.id)}
                className="rounded-md bg-accent px-3 py-1 text-xxs text-white hover:bg-accent-hover"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="rounded-md bg-bg-raised px-3 py-1 text-xxs text-text-secondary hover:bg-bg-highlight"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
            {renderContentWithWikilinks(message.content)}
          </div>
        )}

        {!isEditing && (
          <>
            <p className="mt-1.5 text-xxs text-text-muted flex items-center gap-1">
              <span>
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {message.hasSiblings && (
                <span className="inline-flex items-center gap-0.5 text-accent" title="Conversation branch">
                  <GitBranch className="h-2.5 w-2.5" />
                </span>
              )}
            </p>
            <div className="mt-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => onTtsPlay(message.id, message.content)}
                className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
                title={ttsPlayingId === message.id ? "Stop" : "Read Aloud"}
              >
                {ttsPlayingId === message.id ? (
                  <VolumeX className="h-3 w-3 text-accent" />
                ) : (
                  <Volume2 className="h-3 w-3" />
                )}
              </button>
              <button
                onClick={() => onCopy(message.id, message.content)}
                className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
                title="Copy"
              >
                {copiedId === message.id ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              {!isAI && (
                <button
                  onClick={() => onStartEdit(message)}
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
                  title="Edit"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => onShowEditHistory(message.id)}
                className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
                title="Edit history"
              >
                <History className="h-3 w-3" />
              </button>
              {isLastAI && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
                  title="Regenerate"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              {isLastAI && onRegenerateChoices && (
                <button
                  onClick={onRegenerateChoices}
                  disabled={isRegeneratingChoices}
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary disabled:opacity-50"
                  title="Regenerate choices"
                >
                  {isRegeneratingChoices ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Lightbulb className="h-3 w-3" />
                  )}
                </button>
              )}
              <button
                onClick={() => onDelete(message.id)}
                className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-error"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export { MessageItem };
export type { MessageItemProps, Intent };

export interface MessageListProps {
  messages: Message[];
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
  onRegenerateChoices?: () => void;
  isRegeneratingChoices?: boolean;
}

/**
 * Renders the message list with entrance animations.
 * Each message is rendered via the memoized MessageItem.
 */
export const MessageList = memo(function MessageList({
  messages,
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
  onRegenerateChoices,
  isRegeneratingChoices = false,
}: MessageListProps) {
  // Track which message IDs existed on mount (for entrance animations).
  // Uses useState lazy init to avoid ref access during render (React 19 rule).
  const [initialMessageIds] = useState(() => new Set(messages.map((m) => m.id)));

  // Filter out empty user messages (AI messages preserved for streaming transition)
  const visibleMessages = messages.filter(
    (m) => m.senderId === null || (m.content && m.content.trim())
  );
  const lastMsgId = visibleMessages[visibleMessages.length - 1]?.id;

  return (
    <div className="space-y-3">
      {visibleMessages.map((message) => {
        const isAI = message.senderId === null;
        const isLastAI = isAI && message.id === lastMsgId;
        const wasSeen = initialMessageIds.has(message.id);
        const animationClass = wasSeen ? "" : "animate-message-slide";

        return (
          <div key={message.id} className={animationClass}>
            <MessageItem
              message={message}
              isAI={isAI}
              isLastAI={isLastAI}
              isEditing={editingId === message.id}
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
              onRegenerateChoices={isLastAI ? onRegenerateChoices : undefined}
              isRegeneratingChoices={isRegeneratingChoices}
            />
          </div>
        );
      })}
    </div>
  );
});
