interface PersonaTabPersonalityProps {
  formPersonality: string;
  onChange: (field: string, value: string) => void;
}

export function PersonaTabPersonality({
  formPersonality,
  onChange,
}: PersonaTabPersonalityProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Personality</label>
        <p className="text-[10px] text-text-muted mb-1">Character traits, behaviors, motivations. Can be bullet points or prose.</p>
        <textarea
          value={formPersonality}
          onChange={(e) => onChange("personality", e.target.value)}
          placeholder="Brave, stubborn, loyal to friends, distrusts authority. Has a dry sense of humor."
          rows={8}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
        />
      </div>
    </div>
  );
}
