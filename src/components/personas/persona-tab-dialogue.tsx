interface PersonaTabDialogueProps {
  formFirstMes: string;
  formMesExample: string;
  onChange: (field: string, value: string) => void;
}

export function PersonaTabDialogue({
  formFirstMes,
  formMesExample,
  onChange,
}: PersonaTabDialogueProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-text-secondary">First Message</label>
        <p className="text-[10px] text-text-muted mb-1">The opening message when starting a session with this character.</p>
        <textarea
          value={formFirstMes}
          onChange={(e) => onChange("firstMes", e.target.value)}
          placeholder="*The door creaks open as you step inside...*&#10;&#10;Welcome. I've been expecting you."
          rows={5}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Example Dialogue</label>
        <p className="text-[10px] text-text-muted mb-1">Example conversations showing how the character speaks. Use &lt;START&gt; for new examples.</p>
        <textarea
          value={formMesExample}
          onChange={(e) => onChange("mesExample", e.target.value)}
          placeholder={`<START>\n{{user}}: "Hello there."\n{{char}}: *nods slowly* "Evening. What can I do for you?"\n\n<START>\n{{user}}: "Tell me about yourself."\n{{char}}: "Not much to tell. I keep to myself mostly."`}
          rows={10}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none font-mono"
        />
      </div>
    </div>
  );
}
