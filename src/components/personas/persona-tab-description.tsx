interface PersonaTabDescriptionProps {
  formName: string;
  formDescription: string;
  formTags: string;
  formWritingStyle: string;
  onChange: (field: string, value: string) => void;
}

export function PersonaTabDescription({
  formName,
  formDescription,
  formTags,
  formWritingStyle,
  onChange,
}: PersonaTabDescriptionProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Name *</label>
        <input
          type="text"
          value={formName}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Character name"
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Description</label>
        <p className="text-[10px] text-text-muted mb-1">Physical appearance, background, key traits. Used in the character card.</p>
        <textarea
          value={formDescription}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="A tall, scarred warrior with piercing blue eyes..."
          rows={6}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Tags</label>
        <p className="text-[10px] text-text-muted mb-1">Comma-separated tags for organization</p>
        <input
          type="text"
          value={formTags}
          onChange={(e) => onChange("tags", e.target.value)}
          placeholder="fantasy, warrior, anti-hero..."
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Writing Style</label>
        <input
          type="text"
          value={formWritingStyle}
          onChange={(e) => onChange("writingStyle", e.target.value)}
          placeholder="e.g. Formal, sarcastic, poetic..."
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>
    </div>
  );
}
