import { User } from "lucide-react";

interface PersonaPreviewProps {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  mesExample: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistory: string;
  tags: string;
  writingStyle: string;
}

export function PersonaPreview({
  name,
  description,
  personality,
  scenario,
  firstMes,
  mesExample,
  creatorNotes,
  systemPrompt,
  postHistory,
  tags,
  writingStyle,
}: PersonaPreviewProps) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-16 w-16 rounded-lg bg-bg-raised flex items-center justify-center text-text-muted">
          <User className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-primary">{name || "Unnamed"}</h3>
          {tags && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {tags.split(",").map((t) => t.trim()).filter(Boolean).map((t, i) => (
                <span key={i} className="rounded-full bg-bg-raised px-2 py-0.5 text-[10px] text-text-muted">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {description && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">Description</h4>
          <p className="text-xs text-text-secondary whitespace-pre-wrap">{description}</p>
        </div>
      )}
      {personality && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">Personality</h4>
          <p className="text-xs text-text-secondary whitespace-pre-wrap">{personality}</p>
        </div>
      )}
      {writingStyle && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">Writing Style</h4>
          <p className="text-xs text-text-secondary">{writingStyle}</p>
        </div>
      )}
      {scenario && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">Scenario</h4>
          <p className="text-xs text-text-secondary whitespace-pre-wrap">{scenario}</p>
        </div>
      )}
      {firstMes && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">First Message</h4>
          <div className="rounded-lg bg-bg-raised p-3">
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{firstMes}</p>
          </div>
        </div>
      )}
      {mesExample && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">Example Dialogue</h4>
          <div className="rounded-lg bg-bg-raised p-3 font-mono text-[11px] text-text-secondary whitespace-pre-wrap">{mesExample}</div>
        </div>
      )}
      {postHistory && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">Post-History Instructions</h4>
          <p className="text-xs text-text-secondary whitespace-pre-wrap">{postHistory}</p>
        </div>
      )}
      {systemPrompt && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-text-accent mb-1">System Prompt Override</h4>
          <p className="text-xs text-text-secondary whitespace-pre-wrap">{systemPrompt}</p>
        </div>
      )}
      {creatorNotes && (
        <div>
          <h4 className="text-xs font-medium text-text-muted mb-1">Creator Notes</h4>
          <p className="text-xs text-text-muted whitespace-pre-wrap">{creatorNotes}</p>
        </div>
      )}
    </div>
  );
}
