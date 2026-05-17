/**
 * BacklinkPanel Component
 *
 * Displays backlinks for an entity with source context and navigation.
 *
 * Usage:
 *   <BacklinkPanel
 *     entityType="npc"
 *     entityId={npcId}
 *     backlinks={backlinks}
 *     onNavigate={(type, id) => navigate(type, id)}
 *   />
 */

"use client";

import { Link2, ExternalLink } from "lucide-react";

interface Backlink {
  id: string;
  source_type: string;
  source_id: string;
  source_name: string;
  link_type: string;
  context_snippet: string;
  created_at: string;
}

interface BacklinkPanelProps {
  entityType: string;
  entityId: string;
  backlinks: Backlink[];
  onNavigate: (type: string, id: string) => void;
}

const LINK_TYPE_LABELS: Record<string, string> = {
  mentions: "Mentions",
  references: "References",
  related_to: "Related To",
  located_in: "Located In",
  involved_in: "Involved In",
  part_of: "Part Of",
};

export function BacklinkPanel({
  entityType,
  entityId,
  backlinks,
  onNavigate,
}: BacklinkPanelProps) {
  if (backlinks.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-8 text-center">
        <Link2 className="mx-auto h-8 w-8 text-text-muted" />
        <h3 className="mt-2 text-sm font-medium text-text-primary">No backlinks</h3>
        <p className="mt-1 text-xs text-text-muted">
          Links from other entities will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          Backlinks ({backlinks.length})
        </h3>
      </div>

      {backlinks.map((link) => {
        const daysAgo = Math.round(
          (Date.now() - new Date(link.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        return (
          <div
            key={link.id}
            className="rounded-lg border border-border-default bg-bg-raised p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-accent" />
                <button
                  onClick={() => onNavigate(link.source_type, link.source_id)}
                  className="text-sm font-medium text-text-primary hover:text-accent"
                >
                  {link.source_name}
                </button>
              </div>
              <span className="text-xxs text-text-muted">
                {daysAgo === 0 ? "Today" : `${daysAgo}d ago`}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="rounded bg-bg-overlay px-1.5 py-0.5 text-xxs text-text-muted">
                {LINK_TYPE_LABELS[link.link_type] || link.link_type}
              </span>
            </div>

            {link.context_snippet && (
              <p className="mt-2 text-xs text-text-secondary line-clamp-2">
                "{link.context_snippet}"
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
