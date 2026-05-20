/**
 * Shared TypeScript types for the Roleplay-Engine codebase.
 *
 * Centralizes common type definitions to reduce `any` usage
 * and improve type safety across API routes, lib utilities, and components.
 */

import type { Database } from 'better-sqlite3';

// ── Database ────────────────────────────────────────────────────────────────

export type DbDatabase = Database;
export type DbRow = Record<string, unknown>;
export type DbParams = (string | number | null)[];

/**
 * Typed interface for paginated database rows.
 * All pagination routes return rows with at least an `id` column.
 */
export interface PaginatedRow {
  id: string;
  [key: string]: unknown;
}

/**
 * Flexible database result type for rows accessed with dot notation.
 * Use this for helper functions that return raw query results with
 * arbitrary columns (e.g., access checks, migration utilities).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbResult = Record<string, any>;

// ── Auth ────────────────────────────────────────────────────────────────────

export interface DecodedToken {
  sub: string;
  username: string;
  userId?: string;
  [key: string]: unknown;
}

// ── API Responses ───────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

// ── Job System ──────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

// ── Event Bus ───────────────────────────────────────────────────────────────

export type EventHandler<T = unknown> = (data: T) => void;
