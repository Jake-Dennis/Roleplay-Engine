interface PersonaTabAdvancedProps {
  formSystemPrompt: string;
  formPostHistory: string;
  formCreatorNotes: string;
  formLlmModel: string;
  onChange: (field: string, value: string) => void;
}

export function PersonaTabAdvanced({
  formSystemPrompt,
  formPostHistory,
  formCreatorNotes,
  formLlmModel,
  onChange,
}: PersonaTabAdvancedProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-text-secondary">System Prompt Override</label>
        <p className="text-[10px] text-text-muted mb-1">Custom system prompt for this character. Overrides the default.</p>
        <textarea
          value={formSystemPrompt}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
          placeholder="You are now playing the role of..."
          rows={4}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Post-History Instructions</label>
        <p className="text-[10px] text-text-muted mb-1">Instructions appended after the conversation history. Controls how the character responds.</p>
        <textarea
          value={formPostHistory}
          onChange={(e) => onChange("postHistory", e.target.value)}
          placeholder="Write in third person. Use asterisks for actions. Keep responses under 3 paragraphs."
          rows={4}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Creator Notes</label>
        <p className="text-[10px] text-text-muted mb-1">Personal notes about this character. Not sent to the LLM.</p>
        <textarea
          value={formCreatorNotes}
          onChange={(e) => onChange("creatorNotes", e.target.value)}
          placeholder="Based on a character from my D&D campaign. Remember to update the backstory after session 3."
          rows={3}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Preferred LLM Model</label>
        <input
          type="text"
          value={formLlmModel}
          onChange={(e) => onChange("llmModel", e.target.value)}
          placeholder="e.g. qwen3.5:4b (leave empty for default)"
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>
    </div>
  );
}
