"use client";

/**
 * StreamingArea Component
 *
 * Displays AI streaming content and narrative choice buttons.
 * Rendered below the message list during and after generation.
 *
 * Usage:
 *   <StreamingArea
 *     isStreaming={streaming}
 *     streamingContent={streamContent}
 *     choices={choices}
 *     onChoiceSelect={handleChoiceSelect}
 *   />
 */

import { memo } from "react";
import { Compass } from "lucide-react";
import { StreamingText } from "@/components/chat/streaming-text";

export interface StreamingAreaProps {
  isStreaming: boolean;
  streamingContent: string;
  choices: string[] | null | undefined;
  onChoiceSelect?: (option: string) => void;
}

/**
 * Renders the streaming text block during AI generation
 * and narrative choice buttons after generation completes.
 */
export const StreamingArea = memo(function StreamingArea({
  isStreaming,
  streamingContent,
  choices,
  onChoiceSelect,
}: StreamingAreaProps) {
  const hasStreaming = isStreaming && streamingContent;
  const hasChoices = choices && choices.length > 0 && !isStreaming;

  if (!hasStreaming && !hasChoices) return null;

  return (
    <>
      {/* Streaming message */}
      {hasStreaming && (
        <div id="msg-streaming" className="flex animate-message-slide">
          <div className="max-w-[75%] rounded-xl border border-border-default bg-bg-elevated px-4 py-3">
            <p className="text-xxs font-medium text-text-muted mb-1">AI Narrator</p>
            <StreamingText content={streamingContent} isStreaming={isStreaming} />
          </div>
        </div>
      )}

      {/* Narrative choices — shown after generation completes */}
      {hasChoices && (
        <div className="animate-message-slide">
          <div className="flex items-center gap-1.5 mb-2">
            <Compass className="h-3.5 w-3.5 text-accent" />
            <p className="text-xxs font-medium text-text-muted">
              Where does the story go next?
            </p>
          </div>
          <div className="grid gap-2">
            {choices!.map((option, i) => (
              <button
                key={i}
                onClick={() => onChoiceSelect?.(option)}
                className="group flex items-start gap-3 rounded-lg border border-border-default bg-bg-elevated px-4 py-3 text-left text-sm text-text-primary transition-all hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-default text-xxs text-text-muted group-hover:border-accent/50 group-hover:text-accent">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{option}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
});
