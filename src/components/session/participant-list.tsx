"use client";

/**
 * ParticipantList Component
 *
 * Displays session participants with invite, kick, and turn controls.
 * Extracted from session/[id]/page.tsx.
 *
 * Usage:
 *   <ParticipantList
 *     participants={participants}
 *     isOwner={isOwner}
 *     turnConfig={turnConfig}
 *     onInvite={(username) => handleInvite(username)}
 *     onKick={(id) => handleKick(id)}
 *     onLeave={() => handleLeave()}
 *     onSetTurnMode={(mode) => handleSetTurnMode(mode)}
 *     onAdvanceTurn={() => handleAdvanceTurn()}
 *     onClaimTurn={() => handleClaimTurn()}
 *     onClose={() => setShowPanel(false)}
 *   />
 */

import { useState, memo } from "react";
import { Users, UserMinus, UserPlus, Footprints, Eye } from "lucide-react";

interface Participant {
  id: string;
  username: string;
  role: string;
  character_name: string | null;
  joined_at: string;
}

interface TurnConfig {
  turnMode: string;
  turnOrder: string[];
  currentTurn: string | null;
}

interface ParticipantListProps {
  participants: Participant[];
  isOwner: boolean;
  turnConfig: TurnConfig | null;
  onInvite: (username: string) => void;
  onKick: (participantId: string) => void;
  onLeave: () => void;
  onSetTurnMode: (mode: string) => void;
  onAdvanceTurn: () => void;
  onClaimTurn: () => void;
  onRoleChange?: (participantId: string, role: string) => void;
  onClose: () => void;
}

export const ParticipantList = memo(function ParticipantList({
  participants,
  isOwner,
  turnConfig,
  onInvite,
  onKick,
  onLeave,
  onSetTurnMode,
  onAdvanceTurn,
  onClaimTurn,
  onRoleChange,
  onClose,
}: ParticipantListProps) {
  const [inviteUsername, setInviteUsername] = useState("");

  function handleInviteSubmit() {
    if (!inviteUsername.trim()) return;
    onInvite(inviteUsername.trim());
    setInviteUsername("");
  }

  return (
    <div className="border-b border-border-default bg-bg-raised px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Participants ({participants.length})
        </h3>
        {isOwner ? (
          <button
            onClick={onClose}
            className="text-xxs text-accent hover:underline"
          >
            Close
          </button>
        ) : (
          <button
            onClick={onLeave}
            className="text-xxs text-error hover:underline flex items-center gap-1"
          >
            <UserMinus className="h-3 w-3" />
            Leave Session
          </button>
        )}
      </div>

      {/* Participant list */}
      <div className="space-y-1.5 mb-3">
        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-bg-elevated px-3 py-1.5"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-xxs font-medium text-accent">
                {p.username[0].toUpperCase()}
              </div>
              <span className="text-xs text-text-primary">{p.username}</span>
              {p.character_name && (
                <span className="text-xxs text-accent">as {p.character_name}</span>
              )}
              {p.role === "owner" && (
                <span className="text-xxs text-text-muted">(Owner)</span>
              )}
              {p.role === "observer" && (
                <span className="inline-flex items-center gap-0.5 text-xxs text-text-muted">
                  <Eye className="h-2.5 w-2.5" />
                  Observer
                </span>
              )}
            </div>
            {isOwner && p.role !== "owner" && (
              <div className="flex items-center gap-1">
                {onRoleChange && (
                  <select
                    value={p.role}
                    onChange={(e) => onRoleChange(p.id, e.target.value)}
                    className="rounded border border-border-default bg-bg-elevated px-1.5 py-0.5 text-xxs text-text-primary"
                  >
                    <option value="participant">Participant</option>
                    <option value="observer">Observer</option>
                  </select>
                )}
                <button
                  onClick={() => onKick(p.id)}
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-error"
                  title="Kick"
                >
                  <UserMinus className="h-3 w-3" />
                </button>
              </div>
            )}
            {turnConfig?.currentTurn === p.username && (
              <span className="text-xxs text-accent font-medium flex items-center gap-1">
                <Footprints className="h-3 w-3" />
                Current Turn
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Invite form (owner only) */}
      {isOwner && (
        <div className="flex gap-2 mb-3">
          <input
            value={inviteUsername}
            onChange={(e) => setInviteUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInviteSubmit();
            }}
            placeholder="Username to invite..."
            className="flex-1 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-primary placeholder-text-muted transition-colors focus:border-accent"
          />
          <button
            onClick={handleInviteSubmit}
            disabled={!inviteUsername.trim()}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xxs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus className="h-3 w-3" />
            Invite
          </button>
        </div>
      )}

      {/* Turn controls (owner only) */}
      {isOwner && (
        <div className="flex items-center gap-3 border-t border-border-default pt-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xxs text-text-muted">Turn Mode:</label>
            <select
              value={turnConfig?.turnMode || "disabled"}
              onChange={(e) => onSetTurnMode(e.target.value)}
              className="rounded border border-border-default bg-bg-elevated px-2 py-1 text-xxs text-text-primary"
            >
              <option value="disabled">Disabled</option>
              <option value="round_robin">Round Robin</option>
              <option value="free_for_all">Free For All</option>
              <option value="claim">Claim</option>
            </select>
          </div>
          {turnConfig?.turnMode === "round_robin" && (
            <button
              onClick={onAdvanceTurn}
              className="flex items-center gap-1 rounded-md bg-accent/10 px-2.5 py-1 text-xxs text-accent hover:bg-accent/20"
            >
              <Footprints className="h-3 w-3" />
              Advance Turn
            </button>
          )}
          {turnConfig?.turnMode === "claim" && (
            <button
              onClick={onClaimTurn}
              className="flex items-center gap-1 rounded-md bg-accent/10 px-2.5 py-1 text-xxs text-accent hover:bg-accent/20"
            >
              <Footprints className="h-3 w-3" />
              Claim Turn
            </button>
          )}
        </div>
      )}

      {/* Turn indicator for non-owners */}
      {!isOwner && turnConfig?.turnMode !== "disabled" && turnConfig?.currentTurn && (
        <div className="flex items-center gap-1.5 border-t border-border-default pt-3">
          <Footprints className="h-3 w-3 text-accent" />
          <span className="text-xxs text-text-muted">
            Current turn: <span className="text-text-primary font-medium">{turnConfig.currentTurn}</span>
          </span>
          {turnConfig.turnMode === "claim" && (
            <button
              onClick={onClaimTurn}
              className="ml-auto rounded-md bg-accent/10 px-2.5 py-1 text-xxs text-accent hover:bg-accent/20"
            >
              Claim Turn
            </button>
          )}
        </div>
      )}
    </div>
  );
});
