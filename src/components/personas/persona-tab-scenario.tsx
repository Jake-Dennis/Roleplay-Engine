interface PersonaTabScenarioProps {
  formScenario: string;
  onChange: (field: string, value: string) => void;
}

export function PersonaTabScenario({
  formScenario,
  onChange,
}: PersonaTabScenarioProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Scenario</label>
        <p className="text-[10px] text-text-muted mb-1">The situation or context for the character. Where are they? What&apos;s happening?</p>
        <textarea
          value={formScenario}
          onChange={(e) => onChange("scenario", e.target.value)}
          placeholder="The character is a bartender in a cyberpunk city, serving drinks to mercenaries..."
          rows={6}
          className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent resize-none"
        />
      </div>
    </div>
  );
}
