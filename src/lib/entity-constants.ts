/**
 * Entity Constants
 *
 * Shared color maps, labels, and icons for entity types.
 * Consolidates duplicated constants from narrative-threads, timeline, relationships, and other pages.
 */

import { GitBranch, PauseCircle, CheckCircle, XCircle, Clock, MapPin, Users, BookOpen } from "lucide-react";

// ---------------------------------------------------------------------------
// Narrative Threads
// ---------------------------------------------------------------------------

export const THREAD_STATUS_COLORS: Record<string, string> = {
  active: "bg-accent/10 text-accent",
  paused: "bg-amber-500/10 text-amber-500",
  resolved: "bg-success/10 text-success",
  abandoned: "bg-bg-raised text-text-muted",
};

export const ESCALATION_COLORS: Record<string, string> = {
  low: "bg-bg-raised text-text-muted",
  medium: "bg-amber-500/10 text-amber-500",
  high: "bg-error/10 text-error",
  critical: "bg-error/20 text-error font-medium",
};

export const ARC_TYPE_LABELS: Record<string, string> = {
  thread: "Thread",
  main_plot: "Main Plot",
  subplot: "Subplot",
  character_arc: "Character Arc",
  world_building: "World Building",
};

export const THREAD_STATUS_ICONS = {
  active: GitBranch,
  paused: PauseCircle,
  resolved: CheckCircle,
  abandoned: XCircle,
};

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  era_start: "Era Start",
  note: "Note",
  milestone: "Milestone",
};

export const ENTRY_TYPE_ICONS: Record<string, typeof Clock> = {
  event: Clock,
  era_start: Clock,
  note: BookOpen,
  milestone: CheckCircle,
};

export const IMPORTANCE_COLORS: Record<string, string> = {
  low: "bg-bg-raised text-text-muted",
  medium: "bg-blue-500/10 text-blue-500",
  high: "bg-amber-500/10 text-amber-500",
  critical: "bg-error/10 text-error",
};

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export const EMOTION_COLORS: Record<string, string> = {
  trust: "bg-emerald-500",
  suspicion: "bg-amber-500",
  loyalty: "bg-blue-500",
  resentment: "bg-red-500",
  attraction: "bg-pink-500",
  respect: "bg-violet-500",
  fear: "bg-orange-500",
  love: "bg-rose-500",
  anger: "bg-red-600",
  joy: "bg-yellow-400",
  sadness: "bg-blue-400",
  neutral: "bg-gray-500",
};

export const RELATIONSHIP_STAGES = [
  "strangers",
  "acquaintances",
  "allies",
  "friends",
  "close_friends",
  "lovers",
] as const;

// ---------------------------------------------------------------------------
// Lore / Canon
// ---------------------------------------------------------------------------

export const LORE_TYPE_ICONS: Record<string, typeof MapPin> = {
  location: MapPin,
  npc: Users,
  event: Clock,
  relationship: GitBranch,
};

export const CANON_TIER_LABELS: Record<string, string> = {
  immutable_canon: "Immutable Canon",
  soft_canon: "Soft Canon",
  generated_lore: "Generated Lore",
  session_lore: "Session Lore",
  rumor: "Rumor",
};

export const CANON_TIER_COLORS: Record<string, string> = {
  immutable_canon: "border-red-500/50 bg-red-500/10 text-red-400",
  soft_canon: "border-amber-500/50 bg-amber-500/10 text-amber-400",
  generated_lore: "border-blue-500/50 bg-blue-500/10 text-blue-400",
  session_lore: "border-purple-500/50 bg-purple-500/10 text-purple-400",
  rumor: "border-gray-500/50 bg-gray-500/10 text-gray-400",
};
