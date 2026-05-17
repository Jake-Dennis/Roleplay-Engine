/**
 * TypingIndicator Component
 *
 * Animated dots showing that the AI is generating a response.
 * Uses CSS animation for smooth, performant rendering.
 *
 * Usage:
 *   <TypingIndicator />
 */

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-text-muted">
      <div className="flex gap-1">
        <span
          className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-xs">Narrator is thinking...</span>
    </div>
  );
}
