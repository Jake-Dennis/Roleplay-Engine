/**
 * Job Queue Types
 *
 * Shared types, interfaces, and constants for the job processing system.
 * Extracted from job-processor.ts during Phase 3A modularization.
 */

export type JobType =
  | "summarize_messages"
  | "generate_embeddings"
  | "analyze_relationships"
  | "decay_relationships"
  | "compress_memories"
  | "refine_relationship_summary"
  | "archival_processing"
  | "thread_analysis"
  // Wiki enrichment job types
  | "wiki_ingest"
  | "wiki_enrich_entity"
  | "wiki_generate_rumors"
  | "wiki_deepen_page"
  | "wiki_deepen_location"
  | "wiki_extract_event"
  | "generate_session_recap"
  | "npc_evolution"
  | "extract_lore_comprehensive"
  | "scene_state_extract"
  | "wiki_auto_extract"
  | "universe_wiki_sync"
  | "npc_wiki_sync";

export type JobPriority = "high" | "medium" | "low" | "idle";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface JobPayload {
  sessionId?: string;
  messageId?: string;
  content?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  universeId?: string;
  [key: string]: unknown;
}

export interface QueuedJob {
  id: string;
  user_id: string;
  type: JobType;
  priority: JobPriority;
  status: JobStatus;
  payload: string;
  progress: number;
  progress_message: string | null;
  created_at: string;
  processed_at: string | null;
  error: string | null;
  result: string | null;
}

export interface JobResult {
  success: boolean;
  jobId: string;
  type: JobType;
  data?: Record<string, unknown>;
  error?: string;
}

// Dedup window: same job type + context within this time will skip
export const DEDUP_WINDOW_MS = 30_000; // 30 seconds

// Minimum intervals between identical jobs (burst protection)
export const JOB_DEBOUNCE_INTERVALS: Partial<Record<JobType, number>> = {
  wiki_extract_event: 60,      // seconds
  thread_analysis: 60,
  scene_state_extract: 30,
  analyze_relationships: 30,
  generate_session_recap: 120,
  npc_evolution: 60,
};

// Job retention period (days)
export const JOB_RETENTION_DAYS = 30;

// ===== UI Layer Types (shared between jobs pages) =====

export const JOB_TYPES = [
  "analyze_relationships",
  "archival_processing",
  "compress_memories",
  "decay_relationships",
  "extract_lore_comprehensive",
  "generate_embeddings",
  "generate_session_recap",
  "npc_evolution",
  "refine_relationship_summary",
  "scene_state_extract",
  "summarize_messages",
  "thread_analysis",
  "universe_wiki_sync",
  "wiki_auto_extract",
  "wiki_deepen_location",
  "wiki_deepen_page",
  "wiki_enrich_entity",
  "wiki_extract_event",
  "wiki_generate_rumors",
  "wiki_ingest",
] as const;

export const JOB_TYPE_LABELS: Record<string, string> = {
  analyze_relationships: "Relationship Analysis",
  archival_processing: "Archival Processing",
  compress_memories: "Memory Compression",
  decay_relationships: "Relationship Decay",
  extract_lore_comprehensive: "Lore Extraction",
  generate_embeddings: "Embeddings",
  generate_session_recap: "Session Recap",
  npc_evolution: "NPC Evolution",
  refine_relationship_summary: "Summary Refinement",
  scene_state_extract: "Scene State Extract",
  summarize_messages: "Summarize Messages",
  thread_analysis: "Thread Analysis",
  universe_wiki_sync: "Universe Wiki Sync",
  wiki_auto_extract: "Wiki Auto Extract",
  wiki_deepen_location: "Wiki Deepen Location",
  wiki_deepen_page: "Wiki Deepen Page",
  wiki_enrich_entity: "Wiki Enrich Entity",
  wiki_extract_event: "Wiki Extract Event",
  wiki_generate_rumors: "Wiki Generate Rumors",
  wiki_ingest: "Wiki Ingest",
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: "text-error",
  medium: "text-warning",
  low: "text-text-muted",
  idle: "text-text-muted/50",
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  queued: { bg: "bg-accent/10", text: "text-accent", dot: "bg-accent" },
  processing: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning animate-pulse" },
  completed: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
  failed: { bg: "bg-error/10", text: "text-error", dot: "bg-error" },
  cancelled: { bg: "bg-text-muted/10", text: "text-text-muted", dot: "bg-text-muted" },
};

export interface Job {
  id: string;
  user_id: string;
  type: string;
  priority: string;
  status: string;
  payload: string;
  progress: number;
  progress_message: string | null;
  created_at: string;
  processed_at: string | null;
  error: string | null;
  retry_count?: number;
  max_retries?: number;
}

export interface Stats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}
